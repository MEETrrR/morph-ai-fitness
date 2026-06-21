"""
AI Fitness Coach Backend - FastAPI
Membership-based AI fitness coaching platform
"""
import os, json, hmac, hashlib, base64, time, secrets, re, html as html_mod
from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict

import aiosqlite, httpx
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator

# --- Config ---
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("FATAL: SECRET_KEY environment variable must be set. Generate with: python -c 'import secrets; print(secrets.token_hex(32))'")
SECRET_KEY = SECRET_KEY.encode()
TOKEN_EXPIRE_DAYS = 30
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:8080")
DB_PATH = os.path.join(os.path.dirname(__file__), "fitness.db")
FREE_TRIAL_DAYS = 3
MONTHLY_PRICE = 19
AI_DAILY_LIMIT = 10  # Max AI audit calls per user per day
PUSH_SECRET = os.environ.get("PUSH_SECRET", secrets.token_hex(32))

app = FastAPI(title="Morph.AI API")
app.add_middleware(CORSMiddleware, allow_origins=[FRONTEND_ORIGIN], allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

security = HTTPBearer()

# --- Rate limiting ---
_rate_limits = defaultdict(list)

def check_rate_limit(user_id: int, limit: int = AI_DAILY_LIMIT):
    now = time.time()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    key = f"{user_id}:{today}"
    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < 86400]
    if len(_rate_limits[key]) >= limit:
        raise HTTPException(status_code=429, detail=f"今日AI审计次数已达上限({limit}次/天)，请明天再来")
    _rate_limits[key].append(now)

# --- Password Helpers (PBKDF2 + salt) ---
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"pbkdf2:{salt}:{h.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split(":")
        h2 = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return hmac.compare_digest(h, h2.hex())
    except Exception:
        return False

def sanitize(text: str, max_len: int = 200) -> str:
    """Sanitize user input: strip HTML, limit length, escape for safety."""
    if not text: return ""
    text = html_mod.escape(str(text)[:max_len])
    return text

def validate_email(email: str) -> str:
    email = email.lower().strip()
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
        raise HTTPException(status_code=400, detail="邮箱格式不正确")
    if len(email) > 100:
        raise HTTPException(status_code=400, detail="邮箱过长")
    return email

# --- Models ---
class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class CheckInData(BaseModel):
    date: Optional[str] = None
    currentWeight: Optional[float] = None
    weightCondition: Optional[str] = None
    stateDescription: Optional[str] = None
    breakfast: Optional[str] = None
    lunch: Optional[str] = None
    dinner: Optional[str] = None
    tonightExercise: Optional[str] = None
    exerciseFeedback: Optional[str] = None
    ultimateGoal: Optional[str] = None

    @field_validator('currentWeight')
    @classmethod
    def weight_range(cls, v):
        if v is not None and (v < 20 or v > 300):
            raise ValueError('体重必须在20-300kg之间')
        return v

class PaymentRequest(BaseModel):
    plan: str = "monthly"

class PushSubscription(BaseModel):
    subscription: dict

# --- Database ---
async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, is_trial INTEGER DEFAULT 1, trial_ends_at TEXT,
        membership_expires_at TEXT, created_at TEXT DEFAULT (datetime('now')))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        date TEXT NOT NULL, weight REAL, weight_condition TEXT, state_description TEXT,
        breakfast TEXT, lunch TEXT, dinner TEXT, exercise TEXT, feedback TEXT, goal_flag TEXT,
        report TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        subscription_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.commit()
    return db

# --- Token Helpers ---
def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64_decode(s: str) -> bytes:
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)

def create_token(user_id: int, email: str) -> str:
    header = _b64_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64_encode(json.dumps({"sub": str(user_id), "email": email, "exp": int(time.time() + TOKEN_EXPIRE_DAYS * 86400)}).encode())
    sig = _b64_encode(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"

def decode_token(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3: raise ValueError("invalid token")
    header, payload, sig = parts
    expected = _b64_encode(hmac.new(SECRET_KEY, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected): raise ValueError("invalid signature")
    data = json.loads(_b64_decode(payload))
    if data.get("exp", 0) < time.time(): raise ValueError("token expired")
    return data

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = decode_token(credentials.credentials)
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError, KeyError):
        raise HTTPException(status_code=401, detail="无效的登录凭证")
    db = await get_db()
    async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cursor:
        user = await cursor.fetchone()
    if not user: raise HTTPException(status_code=401, detail="用户不存在")
    return dict(user)

def check_membership(user: dict) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    if user.get("membership_expires_at") and user["membership_expires_at"] > now: return True
    if user.get("is_trial") and user.get("trial_ends_at") and user["trial_ends_at"] > now: return True
    return False

# --- Routes ---
@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.post("/api/auth/register")
async def register(body: RegisterRequest):
    email = validate_email(body.email)
    if len(body.password) < 6: raise HTTPException(status_code=400, detail="密码至少6位")
    if len(body.password) > 128: raise HTTPException(status_code=400, detail="密码过长")
    db = await get_db()
    existing = await db.execute("SELECT id FROM users WHERE email = ?", (email,))
    if await existing.fetchone(): raise HTTPException(status_code=400, detail="该邮箱已注册")
    password_hash = hash_password(body.password)
    trial_ends = (datetime.now(timezone.utc) + timedelta(days=FREE_TRIAL_DAYS)).isoformat()
    cursor = await db.execute("INSERT INTO users (email, password_hash, is_trial, trial_ends_at) VALUES (?, ?, 1, ?)", (email, password_hash, trial_ends))
    await db.commit()
    user_id = cursor.lastrowid
    token = create_token(user_id, email)
    return {"access_token": token, "token_type": "bearer", "user": {"id": user_id, "email": email, "is_trial": True, "trial_ends_at": trial_ends, "membership_expires_at": None}}

@app.post("/api/auth/login")
async def login(body: LoginRequest):
    email = validate_email(body.email)
    db = await get_db()
    async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
        user = await cursor.fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    user_dict = dict(user)
    token = create_token(user_dict["id"], user_dict["email"])
    return {"access_token": token, "token_type": "bearer", "user": {"id": user_dict["id"], "email": user_dict["email"], "is_trial": bool(user_dict["is_trial"]), "trial_ends_at": user_dict["trial_ends_at"], "membership_expires_at": user_dict["membership_expires_at"]}}

@app.post("/api/ai/audit")
async def ai_audit(body: CheckInData, user: dict = Depends(get_current_user)):
    if not check_membership(user): raise HTTPException(status_code=403, detail="会员已过期，请续费后使用AI审计功能")
    if not DEEPSEEK_API_KEY: raise HTTPException(status_code=503, detail="AI服务暂未配置")
    check_rate_limit(user["id"])

    # Sanitize all user inputs before building prompt
    safe = {
        "w": body.currentWeight or 0,
        "wc": sanitize(body.weightCondition or "", 30),
        "st": sanitize(body.stateDescription or "", 100),
        "lu": sanitize(body.lunch or "", 100),
        "di": sanitize(body.dinner or "", 100),
        "ex": sanitize(body.tonightExercise or "", 100),
        "fb": sanitize(body.exerciseFeedback or "", 100),
        "gl": sanitize(body.ultimateGoal or "", 100),
    }

    prompt = (
        "你是硬核AI健身教练。用户今日打卡数据：\n"
        f"- 当前体重: {safe['w']} kg ({safe['wc']})\n"
        f"- 状态: {safe['st']}\n"
        f"- 中午吃了: {safe['lu']}\n"
        f"- 晚上吃了: {safe['di']}\n"
        f"- 今日运动: {safe['ex']}\n"
        f"- 身体反馈: {safe['fb']}\n"
        f"- 终极目标: {safe['gl']}\n\n"
        "请按以下四个模块输出硬核审计报告(Markdown格式)：\n\n"
        "## 🚀 模块一：大盘审计与硬核震慑\n"
        "## 🛠️ 模块二：干饭代码一键修复\n"
        "## 🏀 模块三：运动与训练性能包注入\n"
        "## 🚨 模块四：今日教练收盘指令"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.deepseek.com/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={"model": "deepseek-chat", "messages": [{"role": "system", "content": "专业健身教练，语气热血专业。"}, {"role": "user", "content": prompt}], "temperature": 0.7, "max_tokens": 2048}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"AI服务异常: {resp.status_code}")
            data = resp.json()
            report = data["choices"][0]["message"]["content"]
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI服务响应超时，请稍后重试")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="AI调用失败，请稍后重试")

    db = await get_db()
    await db.execute(
        "INSERT INTO checkins (user_id, date, weight, weight_condition, state_description, breakfast, lunch, dinner, exercise, feedback, goal_flag, report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user["id"], body.date or datetime.now().strftime("%Y-%m-%d"), body.currentWeight, body.weightCondition,
         safe["st"], sanitize(body.breakfast or "", 100), safe["lu"], safe["di"], safe["ex"], safe["fb"], safe["gl"], report))
    await db.commit()
    return {"report": report}

@app.get("/api/checkins")
async def get_checkins(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", (user["id"],)) as cursor:
        rows = await cursor.fetchall()
    return {"checkins": [{"id": r["id"], "date": r["date"], "weight": r["weight"], "checkIn": {"date": r["date"], "currentWeight": r["weight"], "weightCondition": r["weight_condition"], "stateDescription": r["state_description"], "breakfast": r["breakfast"], "lunch": r["lunch"], "dinner": r["dinner"], "tonightExercise": r["exercise"], "exerciseFeedback": r["feedback"], "ultimateGoal": r["goal_flag"]}, "report": r["report"]} for r in [dict(r) for r in rows]]}

@app.post("/api/payment/create")
async def create_payment(body: PaymentRequest, user: dict = Depends(get_current_user)):
    return {"message": "支付接口预留", "qr_url": None, "plan": body.plan, "amount": MONTHLY_PRICE}

@app.get("/api/payment/status")
async def payment_status(user: dict = Depends(get_current_user)):
    return {"paid": False, "message": "支付状态检查预留接口"}

@app.post("/api/push/subscribe")
async def push_subscribe(body: PushSubscription, user: dict = Depends(get_current_user)):
    db = await get_db()
    sub_json = json.dumps(body.subscription)
    await db.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (user["id"],))
    await db.execute("INSERT INTO push_subscriptions (user_id, subscription_json) VALUES (?, ?)", (user["id"], sub_json))
    await db.commit()
    return {"message": "订阅成功"}

@app.post("/api/push/send-daily")
async def send_daily_push(request: Request):
    """Scheduled endpoint - requires PUSH_SECRET header"""
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {PUSH_SECRET}":
        raise HTTPException(status_code=401, detail="鉴权失败")
    db = await get_db()
    async with db.execute("SELECT * FROM push_subscriptions") as cursor:
        rows = await cursor.fetchall()
    results = []
    for row in rows:
        try:
            sub = json.loads(row["subscription_json"])
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    sub.get("endpoint", ""),
                    json={},
                    headers={"Content-Type": "application/json",
                             "Content-Encoding": "aes128gcm",
                             "TTL": "86400"}
                )
                results.append({"user_id": row["user_id"], "status": resp.status_code})
        except Exception as e:
            results.append({"user_id": row["user_id"], "status": str(e)})
    return {"sent": len(results), "results": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
