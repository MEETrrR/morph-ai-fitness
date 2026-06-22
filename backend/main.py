"""
AI Fitness Coach Backend - FastAPI
Membership-based AI fitness coaching platform
"""
import os, json, hmac, hashlib, base64, time, secrets, re, html as html_mod
from datetime import datetime, timedelta, timezone
from typing import Optional
from collections import defaultdict

import aiosqlite, httpx
from fastapi import FastAPI, HTTPException, Depends, Request, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
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
AI_DAILY_LIMIT = 10
PUSH_SECRET = os.environ.get("PUSH_SECRET", secrets.token_hex(32))
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
COMMUNITY_LIMIT = 5  # Max posts per user per day
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Sensitive word filter
SENSITIVE_WORDS = {
    "色情", "裸体", "黄色", "三级", "A片", "成人", "妓", "嫖", "淫", "荡",
    "政治", "习近平", "共产党", "法轮功", "台独", "藏独", "64", "天安门",
    "毒品", "冰毒", "大麻", "海洛因", "赌博", "赌场", "六合彩",
    "枪支", "炸弹", "恐怖", "杀人", "自杀",
}

def filter_content(text: str) -> tuple:
    """Returns (cleaned_text, is_blocked)"""
    text_lower = text.lower()
    for word in SENSITIVE_WORDS:
        if word.lower() in text_lower:
            return "", True
    return sanitize(text, 500), False

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

async def create_user_profile(db, user_id: int):
    await db.execute("INSERT OR IGNORE INTO user_profiles (user_id, nickname) VALUES (?, ?)", (user_id, f"用户{user_id}"))

async def add_notification(db, user_id: int, from_user_id: int, ntype: str, post_id: int = None, content: str = ""):
    await db.execute("INSERT INTO notifications (user_id, from_user_id, type, post_id, content) VALUES (?, ?, ?, ?, ?)", (user_id, from_user_id, ntype, post_id, content))
    await db.commit()

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
        phone TEXT DEFAULT '', password_hash TEXT NOT NULL, is_trial INTEGER DEFAULT 1, trial_ends_at TEXT,
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
    await db.execute("""
        CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT,
        inviter_id INTEGER NOT NULL, invitee_id INTEGER, code TEXT UNIQUE NOT NULL,
        registered_at TEXT, rewarded INTEGER DEFAULT 0, rewarded_at TEXT,
        created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (inviter_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
        content TEXT NOT NULL, image_path TEXT, likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0, reports_count INTEGER DEFAULT 0,
        is_hidden INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS community_comments (id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL,
        reports_count INTEGER DEFAULT 0, is_hidden INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES community_posts(id), FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS community_likes (id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL, user_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(post_id, user_id), FOREIGN KEY (post_id) REFERENCES community_posts(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (user_id INTEGER PRIMARY KEY,
        nickname TEXT DEFAULT '', bio TEXT DEFAULT '', avatar_path TEXT DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_id INTEGER NOT NULL, following_id INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(follower_id, following_id), FOREIGN KEY (follower_id) REFERENCES users(id),
        FOREIGN KEY (following_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, from_user_id INTEGER, type TEXT NOT NULL, post_id INTEGER,
        content TEXT DEFAULT '', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id))
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS food_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, log_type TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
        image_path TEXT, ai_response TEXT DEFAULT '', calories_estimate INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))
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
    await create_user_profile(db, user_id)
    token = create_token(user_id, email)
    return {"access_token": token, "token_type": "bearer", "user": {"id": user_id, "email": email, "is_trial": True, "trial_ends_at": trial_ends, "membership_expires_at": None}}

@app.post("/api/auth/login")
async def login(body: LoginRequest):
    identity = body.email.lower().strip()
    is_phone = bool(__import__("re").match(r"^\+?\d{6,15}$", identity))
    db = await get_db()
    if is_phone:
        async with db.execute("SELECT * FROM users WHERE phone = ?", (identity,)) as cursor:
            user = await cursor.fetchone()
    else:
        email = validate_email(identity) if "@" in identity else identity
        async with db.execute("SELECT * FROM users WHERE email = ? OR phone = ?", (email, identity)) as cursor:
            user = await cursor.fetchone()
    async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
        user = await cursor.fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    user_dict = dict(user)
    token = create_token(user_dict["id"], user_dict["email"])
    return {"access_token": token, "token_type": "bearer", "user": {"id": user_dict["id"], "email": user_dict["email"], "is_trial": bool(user_dict["is_trial"]), "trial_ends_at": user_dict["trial_ends_at"], "membership_expires_at": user_dict["membership_expires_at"]}}

@app.post("/api/auth/reset-password")
async def reset_password(body: LoginRequest):
    """Send password reset email (simplified: returns new random password)"""
    email = validate_email(body.email)
    db = await get_db()
    async with db.execute("SELECT * FROM users WHERE email = ?", (email,)) as cursor:
        user = await cursor.fetchone()
    if not user:
        return {"message": "如果该邮箱已注册，重置邮件已发送"}
    new_password = secrets.token_hex(6)
    new_hash = hash_password(new_password)
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (new_hash, user["id"]))
    await db.commit()
    # In production: send email via SMTP. For MVP, return the new password directly.
    return {"message": "密码重置邮件已发送（MVP模式暂不支持邮件，请联系客服重置）"}

@app.delete("/api/auth/delete-account")
async def delete_account(user: dict = Depends(get_current_user)):
    db = await get_db()
    await db.execute("DELETE FROM checkins WHERE user_id = ?", (user["id"],))
    await db.execute("DELETE FROM push_subscriptions WHERE user_id = ?", (user["id"],))
    await db.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    await db.commit()
    return {"message": "账户已永久删除"}

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

@app.get("/api/referral/code")
async def referral_code(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT code FROM referrals WHERE inviter_id = ? LIMIT 1", (user["id"],)) as cursor:
        row = await cursor.fetchone()
    if row: return {"code": row["code"]}
    code = f"MORPH-{secrets.token_hex(3).upper()}"
    await db.execute("INSERT INTO referrals (inviter_id, code) VALUES (?, ?)", (user["id"], code))
    await db.commit()
    return {"code": code}

@app.get("/api/referral/stats")
async def referral_stats(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT COUNT(*) as c FROM referrals WHERE inviter_id = ? AND invitee_id IS NOT NULL", (user["id"],)) as cursor:
        total = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM referrals WHERE inviter_id = ? AND rewarded = 1", (user["id"],)) as cursor:
        rewarded = (await cursor.fetchone())["c"]
    return {"invited": total, "rewarded": rewarded}

@app.post("/api/referral/apply")
async def referral_apply(code: str = "", user: dict = Depends(get_current_user)):
    code = code.upper().strip()
    if not code: raise HTTPException(status_code=400, detail="邀请码缺失")
    db = await get_db()
    async with db.execute("SELECT * FROM referrals WHERE code = ? AND invitee_id IS NULL", (code,)) as cursor:
        ref = await cursor.fetchone()
    if not ref: raise HTTPException(status_code=404, detail="邀请码无效")
    if ref["inviter_id"] == user["id"]: raise HTTPException(status_code=400, detail="不能邀请自己")
    async with db.execute("SELECT id FROM referrals WHERE invitee_id = ?", (user["id"],)) as cursor:
        if await cursor.fetchone(): raise HTTPException(status_code=400, detail="已被邀请过")
    await db.execute("UPDATE referrals SET invitee_id = ?, registered_at = datetime('now') WHERE id = ?", (user["id"], ref["id"]))
    await db.commit()
    return {"message": "邀请绑定成功"}

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

# --- Community API ---
@app.get("/api/community/posts")
async def list_posts(category: str = "", sort: str = "new", page: int = 1):
    db = await get_db()
    where = "WHERE is_hidden = 0"
    params = []
    if category: where += " AND category = ?"; params.append(category)
    order = "created_at DESC" if sort == "new" else "likes_count DESC"
    limit = 20
    offset = (page - 1) * limit
    async with db.execute(f"SELECT p.*, u.email FROM community_posts p JOIN users u ON p.user_id = u.id {where} ORDER BY {order} LIMIT ? OFFSET ?", params + [limit, offset]) as cursor:
        posts = [dict(r) for r in await cursor.fetchall()]
    for p in posts:
        p["email"] = p["email"].split("@")[0] + "@***"  # Mask email
        p.pop("is_hidden", None); p.pop("reports_count", None)
    return {"posts": posts}

@app.get("/api/community/posts/{post_id}")
async def get_post(post_id: int):
    db = await get_db()
    async with db.execute("SELECT p.*, u.email FROM community_posts p JOIN users u ON p.user_id = u.id WHERE p.id = ? AND p.is_hidden = 0", (post_id,)) as cursor:
        post = await cursor.fetchone()
    if not post: raise HTTPException(status_code=404, detail="帖子不存在")
    post = dict(post)
    post["email"] = post["email"].split("@")[0] + "@***"
    async with db.execute("SELECT c.*, u.email FROM community_comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? AND c.is_hidden = 0 ORDER BY c.created_at", (post_id,)) as cursor:
        comments = [dict(r) for r in await cursor.fetchall()]
    for c in comments: c["email"] = c["email"].split("@")[0] + "@***"
    post["comments"] = comments
    return post

@app.post("/api/community/posts")
async def create_post(title: str = Form(""), content: str = Form(""), category: str = Form(""), image: UploadFile = File(None), user: dict = Depends(get_current_user)):
    title, blocked = filter_content(title)
    if blocked or len(title.strip()) < 2: raise HTTPException(status_code=400, detail="标题包含违禁内容或过短")
    content, blocked = filter_content(content)
    if blocked or len(content.strip()) < 5: raise HTTPException(status_code=400, detail="内容包含违禁内容或过短")
    if category not in ("fat_loss", "muscle_gain", "diet", "exercise", "progress", "qa"): raise HTTPException(status_code=400, detail="无效分类")
    # Rate limit
    db = await get_db()
    async with db.execute("SELECT COUNT(*) as c FROM community_posts WHERE user_id = ? AND created_at > datetime('now', '-1 day')", (user["id"],)) as cursor:
        count = (await cursor.fetchone())["c"]
    if count >= COMMUNITY_LIMIT: raise HTTPException(status_code=429, detail="今日发帖次数已达上限")
    image_path = None
    if image and image.filename:
        img_data = await image.read()
        if len(img_data) > MAX_IMAGE_SIZE: raise HTTPException(status_code=400, detail="图片超过5MB")
        ext = os.path.splitext(image.filename)[1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"): raise HTTPException(status_code=400, detail="不支持的图片格式")
        filename = f"{secrets.token_hex(8)}{ext}"
        with open(os.path.join(UPLOAD_DIR, filename), "wb") as f: f.write(img_data)
        image_path = filename
    cursor = await db.execute("INSERT INTO community_posts (user_id, category, title, content, image_path) VALUES (?, ?, ?, ?, ?)", (user["id"], category, title, content, image_path))
    await db.commit()
    return {"id": cursor.lastrowid, "message": "发帖成功"}

@app.post("/api/community/posts/{post_id}/comments")
async def add_comment(post_id: int, content: str = Form(""), user: dict = Depends(get_current_user)):
    try:
        from fastapi import Body
    except: pass
    content = content or ""
    content, blocked = filter_content(content)
    if blocked or len(content.strip()) < 1: raise HTTPException(status_code=400, detail="评论内容违规或为空")
    db = await get_db()
    cursor = await db.execute("INSERT INTO community_comments (post_id, user_id, content) VALUES (?, ?, ?)", (post_id, user["id"], content))
    await db.execute("UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = ?", (post_id,))
    async with db.execute("SELECT user_id FROM community_posts WHERE id = ?", (post_id,)) as cursor2:
        p = await cursor2.fetchone()
    if p and p["user_id"] != user["id"]: await add_notification(db, p["user_id"], user["id"], "comment", post_id)
    await db.commit()
    return {"id": cursor.lastrowid, "message": "评论成功"}

@app.post("/api/community/posts/{post_id}/like")
async def toggle_like(post_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT id FROM community_likes WHERE post_id = ? AND user_id = ?", (post_id, user["id"])) as cursor:
        existing = await cursor.fetchone()
    if existing:
        await db.execute("DELETE FROM community_likes WHERE id = ?", (existing["id"],))
        await db.execute("UPDATE community_posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?", (post_id,))
        await db.commit()
        return {"liked": False}
    await db.execute("INSERT INTO community_likes (post_id, user_id) VALUES (?, ?)", (post_id, user["id"]))
    await db.execute("UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = ?", (post_id,))
    # Send notification to post author
    async with db.execute("SELECT user_id FROM community_posts WHERE id = ?", (post_id,)) as cursor:
        p = await cursor.fetchone()
    if p and p["user_id"] != user["id"]: await add_notification(db, p["user_id"], user["id"], "like", post_id)
    await db.commit()
    return {"liked": True}

@app.post("/api/community/posts/{post_id}/report")
async def report_post(post_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    await db.execute("UPDATE community_posts SET reports_count = reports_count + 1 WHERE id = ?", (post_id,))
    async with db.execute("SELECT reports_count FROM community_posts WHERE id = ?", (post_id,)) as cursor:
        row = await cursor.fetchone()
    if row and row["reports_count"] >= 3:
        await db.execute("UPDATE community_posts SET is_hidden = 1 WHERE id = ?", (post_id,))
    await db.commit()
    return {"message": "举报已提交"}

@app.post("/api/community/comments/{comment_id}/report")
async def report_comment(comment_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    await db.execute("UPDATE community_comments SET reports_count = reports_count + 1 WHERE id = ?", (comment_id,))
    async with db.execute("SELECT reports_count FROM community_comments WHERE id = ?", (comment_id,)) as cursor:
        row = await cursor.fetchone()
    if row and row["reports_count"] >= 3:
        await db.execute("UPDATE community_comments SET is_hidden = 1 WHERE id = ?", (comment_id,))
    await db.commit()
    return {"message": "举报已提交"}

@app.delete("/api/community/posts/{post_id}")
async def delete_post(post_id: int, user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT user_id FROM community_posts WHERE id = ?", (post_id,)) as cursor:
        post = await cursor.fetchone()
    if not post or post["user_id"] != user["id"]: raise HTTPException(status_code=403, detail="只能删除自己的帖子")
    await db.execute("DELETE FROM community_comments WHERE post_id = ?", (post_id,))
    await db.execute("DELETE FROM community_likes WHERE post_id = ?", (post_id,))
    await db.execute("DELETE FROM community_posts WHERE id = ?", (post_id,))
    await db.commit()
    return {"message": "已删除"}

@app.get("/api/uploads/{filename}")

# --- Social: Profile, Follow, Notifications ---
@app.get("/api/user/profile")
async def get_my_profile(user: dict = Depends(get_current_user)):
    db = await get_db()
    await create_user_profile(db, user["id"])
    async with db.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user["id"],)) as cursor:
        profile = dict(await cursor.fetchone())
    async with db.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?", (user["id"],)) as cursor: profile["following_count"] = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM follows WHERE following_id = ?", (user["id"],)) as cursor: profile["followers_count"] = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM community_posts WHERE user_id = ?", (user["id"],)) as cursor: profile["posts_count"] = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM checkins WHERE user_id = ?", (user["id"],)) as cursor: profile["checkins_count"] = (await cursor.fetchone())["c"]
    profile.update({"email": user["email"], "membership_expires_at": user["membership_expires_at"], "is_trial": bool(user["is_trial"])})
    return profile

@app.put("/api/user/profile")
async def update_profile(nickname: str = Form(""), bio: str = Form(""), user: dict = Depends(get_current_user)):
    nickname, bio = sanitize(nickname, 30), sanitize(bio, 200)
    db = await get_db(); await create_user_profile(db, user["id"])
    await db.execute("UPDATE user_profiles SET nickname = ?, bio = ? WHERE user_id = ?", (nickname, bio, user["id"]))
    await db.commit(); return {"message": "ok", "nickname": nickname}

@app.post("/api/user/avatar")
async def upload_avatar(avatar: UploadFile = File(...), user: dict = Depends(get_current_user)):
    img_data = await avatar.read()
    if len(img_data) > 2*1024*1024: raise HTTPException(status_code=400, detail="头像不超过2MB")
    ext = os.path.splitext(avatar.filename)[1].lower()
    if ext not in (".jpg",".jpeg",".png",".webp"): raise HTTPException(status_code=400, detail="不支持的格式")
    filename = f"avatar_{user['id']}{ext}"
    with open(os.path.join(UPLOAD_DIR, filename), "wb") as f: f.write(img_data)
    db = await get_db()
    await db.execute("UPDATE user_profiles SET avatar_path = ? WHERE user_id = ?", (filename, user["id"]))
    await db.commit(); return {"avatar_url": f"/api/uploads/{filename}"}

@app.get("/api/users/{user_id}/profile")
async def get_public_profile(user_id: int):
    db = await get_db()
    async with db.execute("SELECT p.*, u.email FROM user_profiles p JOIN users u ON p.user_id = u.id WHERE p.user_id = ?", (user_id,)) as cursor:
        profile = await cursor.fetchone()
    if not profile: raise HTTPException(status_code=404)
    profile = dict(profile); profile["email"] = profile["email"].split("@")[0] + "@***"
    async with db.execute("SELECT COUNT(*) as c FROM follows WHERE follower_id = ?", (user_id,)) as cursor: profile["following_count"] = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM follows WHERE following_id = ?", (user_id,)) as cursor: profile["followers_count"] = (await cursor.fetchone())["c"]
    async with db.execute("SELECT COUNT(*) as c FROM community_posts WHERE user_id = ?", (user_id,)) as cursor: profile["posts_count"] = (await cursor.fetchone())["c"]
    return profile

@app.post("/api/users/{user_id}/follow")
async def toggle_follow(user_id: int, user: dict = Depends(get_current_user)):
    if user_id == user["id"]: raise HTTPException(status_code=400, detail="不能关注自己")
    db = await get_db()
    async with db.execute("SELECT id FROM follows WHERE follower_id = ? AND following_id = ?", (user["id"], user_id)) as cursor:
        existing = await cursor.fetchone()
    if existing: await db.execute("DELETE FROM follows WHERE id = ?", (existing["id"],)); await db.commit(); return {"following": False}
    await db.execute("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)", (user["id"], user_id))
    await add_notification(db, user_id, user["id"], "follow")
    await db.commit(); return {"following": True}

@app.get("/api/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT n.*, p.nickname, p.avatar_path FROM notifications n LEFT JOIN user_profiles p ON n.from_user_id = p.user_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 30", (user["id"],)) as cursor:
        return {"notifications": [dict(r) for r in await cursor.fetchall()]}

@app.get("/api/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0", (user["id"],)) as cursor:
        return {"count": (await cursor.fetchone())["c"]}

@app.post("/api/notifications/read-all")
async def read_all(user: dict = Depends(get_current_user)):
    db = await get_db(); await db.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user["id"],)); await db.commit()
    return {"message": "ok"}
async def serve_upload(filename: str):
    path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(path): raise HTTPException(status_code=404)
    return FileResponse(path)

# --- Diet Assistant (Real-time Food Log) ---
@app.post("/api/food/text")
async def log_food_text(content: str = Form(""), user: dict = Depends(get_current_user)):
    content, blocked = filter_content(content)
    if blocked or len(content.strip()) < 2: raise HTTPException(status_code=400, detail="请输入吃了什么")
    if not DEEPSEEK_API_KEY: raise HTTPException(status_code=503, detail="AI服务暂未配置")
    prompt = f"用户刚吃了: {content}。请估算热量(kcal)、分析营养构成，给出简短建议(50字内)。格式: 🔥约XXX kcal | 分析... | 💡建议..."
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post("https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}","Content-Type":"application/json"},
            json={"model":"deepseek-chat","messages":[{"role":"system","content":"你是营养师。简洁回复，含热量估算。"},{"role":"user","content":prompt}],"temperature":0.5,"max_tokens":300})
    if resp.status_code != 200: raise HTTPException(status_code=500, detail=f"AI错误: {resp.status_code}")
    reply = resp.json()["choices"][0]["message"]["content"]
    cal = 0
    import re as _re
    m = _re.search(r'(\d+)\s*kcal', reply.lower())
    if m: cal = int(m.group(1))
    db = await get_db()
    await db.execute("INSERT INTO food_logs (user_id, log_type, content, ai_response, calories_estimate) VALUES (?, 'text', ?, ?, ?)", (user["id"], content, reply, cal))
    await db.commit()
    return {"reply": reply, "calories": cal}

@app.post("/api/food/photo")
async def log_food_photo(image: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not DEEPSEEK_API_KEY: raise HTTPException(status_code=503, detail="AI服务暂未配置")
    img_data = await image.read()
    if len(img_data) > 3 * 1024 * 1024: raise HTTPException(status_code=400, detail="图片不超过3MB")
    ext = os.path.splitext(image.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"): raise HTTPException(status_code=400, detail="不支持的格式")
    filename = f"food_{secrets.token_hex(6)}{ext}"
    img_path = os.path.join(UPLOAD_DIR, filename)
    with open(img_path, "wb") as f: f.write(img_data)
    import base64 as _b64
    b64 = _b64.b64encode(img_data).decode()
    mime = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png","webp":"image/webp"}.get(ext[1:],"image/jpeg")
    prompt = "识别图片中的食物，列出名称、估算总热量(kcal)，给出简短营养建议(50字内)。格式: 🍽️ 食物名 | 🔥约XXX kcal | 💡建议..."
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("https://api.deepseek.com/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}","Content-Type":"application/json"},
            json={"model":"deepseek-chat","messages":[{"role":"system","content":"你是营养师。识别食物并估算热量。"},{"role":"user","content":[{"type":"text","text":prompt},{"type":"image_url","image_url":{"url":f"data:{mime};base64,{b64}"}}]}],"temperature":0.5,"max_tokens":300})
    if resp.status_code != 200: raise HTTPException(status_code=500, detail=f"AI错误: {resp.status_code}")
    reply = resp.json()["choices"][0]["message"]["content"]
    cal = 0
    import re as _re2
    m = _re2.search(r'(\d+)\s*kcal', reply.lower())
    if m: cal = int(m.group(1))
    db = await get_db()
    await db.execute("INSERT INTO food_logs (user_id, log_type, content, image_path, ai_response, calories_estimate) VALUES (?, 'photo', '拍照识别', ?, ?, ?)", (user["id"], filename, reply, cal))
    await db.commit()
    return {"reply": reply, "calories": cal, "image_url": f"/api/uploads/{filename}"}

@app.get("/api/food/today")
async def get_today_food(user: dict = Depends(get_current_user)):
    db = await get_db()
    async with db.execute("SELECT * FROM food_logs WHERE user_id = ? AND created_at > datetime('now', '-1 day') ORDER BY created_at DESC", (user["id"],)) as cursor:
        logs = [dict(r) for r in await cursor.fetchall()]
    total_cal = sum(l.get("calories_estimate", 0) or 0 for l in logs)
    return {"logs": logs, "total_calories": total_cal, "count": len(logs)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
