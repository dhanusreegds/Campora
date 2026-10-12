## Campora – Campus Connect

Connect juniors with seniors for academic guidance, projects, internships, and campus life.

**Live Demo:** https://campora-74gs.onrender.com/

Campora connects junior students (**Seekers**) with senior students (**Helpers**) for academic guidance, skill development, mentorship and campus networking. This is a working full-stack prototype: every page talks to a real Express API backed by MongoDB.

**Stack:** HTML / CSS / vanilla JavaScript (ES modules) · Node.js + Express · MongoDB + Mongoose · JWT login · rule-based skill matching · REST chat · QR codes (`qrcode`).

**Palette:** Primary `#4A6B8A` · Background `#E8DDC9` · Accent `#A7B8C9` · Text `#2F4858` (defined as CSS variables at the top of `public/css/styles.css`).

---

## 1. Requirements

- **Node.js 18 or newer** (`node -v` to check). Download from <https://nodejs.org>.
- **MongoDB**, either:
  - installed locally (MongoDB Community Server), or
  - a free cloud database on MongoDB Atlas.
- **VS Code** (optional, any editor works).

## 2. Run it in VS Code (step by step)

1. Unzip the project and open the `campora` folder in VS Code (`File > Open Folder`).
2. Open the integrated terminal (`Terminal > New Terminal`).
3. **Install dependencies**
   ```bash
   npm install
   ```
4. **Configure MongoDB** (pick one)
   - **Local MongoDB:** install and start it. It listens on `mongodb://127.0.0.1:27017` by default, which is already the default in Campora, so nothing else is needed.
     - Windows: the installer sets it up as a service. Check `Services > MongoDB Server` is running.
     - macOS (Homebrew): `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
     - Linux: follow the official guide for your distribution, then `sudo systemctl start mongod`.
   - **MongoDB Atlas (cloud):** create a free cluster, add a database user, allow your IP under *Network Access*, click *Connect > Drivers* and copy the connection string. Put it in `.env` in the next step, adding `/campora` before the `?`:
     `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/campora?retryWrites=true&w=majority`
5. **Create your `.env` file** by copying the example:
   ```bash
   # macOS / Linux
   cp .env.example .env
   # Windows (PowerShell)
   Copy-Item .env.example .env
   ```
   Then open `.env` and set at least `MONGODB_URI` (if not using local defaults) and a long random `JWT_SECRET`.
6. **Seed the demo data**
   ```bash
   npm run seed
   ```
   This wipes the Campora collections and recreates the demo users, requests, chat, announcements and benefits. (If you skip this step, the server seeds automatically the first time it starts on an empty database. Set `AUTO_SEED=false` to turn that off.)
7. **Start the server**
   ```bash
   npm start
   ```
   Use `npm run dev` for auto-restart while editing (uses nodemon).
8. **Open the site:** <http://localhost:3000>

## 3. Demo accounts

| Role | Username | Password | Name |
| --- | --- | --- | --- |
| Seeker | `seeker_demo` | `seeker123` | Ananya Sharma |
| Helper | `helper_demo` | `helper123` | Rahul Kumar (verified) |
| Helper | `priya_nair` | `helper123` | Priya Nair (verified) |
| Helper | `arjun_mehta` | `helper123` | Arjun Mehta |
| Helper | `sneha_iyer` | `helper123` | Sneha Iyer |
| Helper | `vikram_singh` | `helper123` | Vikram Singh |
| Helper | `divya_menon` | `helper123` | Divya Menon |

The demo credentials are also shown on the login page, with a "Fill in for me" button.

## 4. Try the main workflows

**Seeker (`seeker_demo`)**
1. From the home page choose **Seeker** and log in. The dashboard shows connections, pending and accepted requests, reward points, recommended Helpers, a leaderboard preview and announcements.
2. **Search Helpers:** type `python`, or filter by department, course, year, skill or "Verified only". Cards show skills, verified badge, points, and *View profile* / *Send request* / *Chat* (Chat appears for accepted connections).
3. **Send a request** to a Helper (for example Sneha Iyer) with a title, problem description, subject, assistance type and optional deadline. Then look at **My Requests**.
4. **Post a Request:** enter *"Can someone help me understand Java inheritance and polymorphism?"*, add the skills `Java`, `OOP`, `Inheritance`, and submit. A pop-up shows the matched Helpers with a score and explanation, for example *"Your post is a good fit for Rahul Kumar (@helper_demo), who has expertise in Java and Object-Oriented Programming."* The matched Helpers are notified.
5. **Chat:** open **My Connections** or **Chat**. Rahul already has a conversation with Ananya (seeded). Send a message.
6. **Campus Benefits, Leaderboard, Announcements, My Profile** are in the sidebar.

**Helper (`helper_demo`)**
1. Choose **Helper** and log in. The bell icon shows the notification *"New Help Request: A post matching your skills has been recommended to you."*
2. **Help Requests > Incoming:** filter by subject or skill, read the full question, then **Accept** or **Reject**. Accepting creates a connection and unlocks chat.
3. **Active:** open the chat, then click **Mark completed**. You earn points based on difficulty (basic 10, intermediate 15, advanced 20 by default). Completing the same request again is blocked.
4. **Announcements:** publish an event (title, description, date, venue, organizer, optional registration link). Seekers see it immediately.
5. **Leaderboard:** ordering is calculated from stored points. Your dashboard shows your calculated position.
6. **Campus Benefits:** redeem (for example Canteen Coupon, 50 points). Confirm, then a QR code and redemption ID (`CAMP-XXXXXX`) appear. Use the **Demo code checker** to check a code or mark it as used. A used code cannot be used again.
7. **My Profile:** update skills, bio, expertise and availability.

## 5. Project structure

```
campora/
├─ server.js                  Starts Express, connects MongoDB, auto-seeds an empty DB
├─ package.json
├─ .env.example               Copy to .env
├─ scripts/smoke-test.js      End-to-end API check (npm run smoke)
├─ src/
│  ├─ app.js                  Express app (API + static frontend)
│  ├─ config/                 env, database, points values, matching settings
│  ├─ models/                 Mongoose schemas
│  ├─ middleware/             auth (JWT + role checks), error handling
│  ├─ controllers/            Request handlers per feature
│  ├─ routes/index.js         All REST routes
│  ├─ services/               matching engine, points, QR, notifications, leaderboard
│  └─ seed/seed.js            Demo data
└─ public/                    Frontend (served by Express)
   ├─ index.html · login.html · register.html · app.html
   ├─ css/styles.css
   ├─ assets/logo.svg
   └─ js/                     api.js, ui.js, main.js (router) and pages/*
```

**Models:** User, HelpRequest, Connection, Message, Announcement, Benefit, Redemption, Notification, and PointTransaction (the points ledger).

## 6. API overview

All routes are under `/api`. Everything except login, register and health needs `Authorization: Bearer <token>`.

| Method and path | Who | Purpose |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/register`, `GET /auth/me` | all | Authentication |
| `PUT /users/me` | all | Update own profile (never role, points or verified) |
| `GET /helpers`, `GET /helpers/:id` | Seeker / all | Search (name, skills, department, course, year, verified) and Helper profile |
| `GET /dashboard/seeker`, `GET /dashboard/helper` | by role | Dashboard data |
| `POST /requests/direct` | Seeker | Send a request to one Helper |
| `POST /requests/public` | Seeker | Post publicly, run matching, notify Helpers |
| `GET /requests/mine` | Seeker | Sent requests and public posts |
| `GET /requests/incoming?tab=&subject=&skill=` | Helper | Incoming, community, active, history |
| `POST /requests/:id/accept` `/reject` `/complete` | Helper | Manage requests, award points |
| `GET /connections` | all | Accepted connections |
| `GET /chat/conversations`, `GET/POST /chat/:userId` | all | One-to-one chat (accepted connections only) |
| `GET/POST /announcements`, `DELETE /announcements/:id` | all / Helper | Campus announcements |
| `GET /leaderboard` | all | Helpers ranked by stored points |
| `GET /benefits`, `POST /benefits/:id/redeem` | all | Campus benefits and redemption (needs `{ "confirm": true }`) |
| `GET /redemptions`, `GET /redemptions/:code` | all | History and QR image |
| `POST /redemptions/validate`, `POST /redemptions/use` | all | Demo code checker (works once per code) |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | all | Notifications |

## 7. How skill matching works (and what it is not)

The matcher in `src/services/matching/` is **rule-based. It is not AI or machine learning**, and the UI says so.

- It compares the skills a post needs with the skills on Helper profiles using a small vocabulary (`skillTaxonomy.js`) of aliases and parent/child relations (for example `OOP` and `Object-Oriented Programming` are the same skill; `Inheritance` is a child of `OOP`).
- If the Seeker lists no skills, it detects known skills in the title and description.
- Score = `85 × coverage + 10 × subject relevance + 5 (verified Helper)`, capped at 100. Coverage gives 1.0 for an exact skill match, 0.6 for a related skill and 0.4 for a partial word overlap. A Helper is only listed when at least one required skill is covered.
- Each result explains itself, for example *"Java and OOP match. Inheritance relates to Object-Oriented Programming."*
- Helpers scoring at least `MATCH_MIN_SCORE` are recommended; the top `MATCH_MAX_NOTIFIED` are notified.

**Adding a real AI service later:** the controllers only call `src/services/matching/index.js`. Create `aiEngine.js` exporting the same `extractSkills` and `rankHelpers` functions (they may be async), register it in the `ENGINES` map in `index.js`, and set `MATCHING_ENGINE=ai`.

## 8. Points and rewards

- Point values live in `.env` (`POINTS_BASIC`, `POINTS_INTERMEDIATE`, `POINTS_ADVANCED`) and are read in `src/config/points.js`.
- A completed request awards points **once**. A `PointTransaction` row with a unique index on the request guards against duplicates, even if two calls arrive at the same time.
- Redemption deducts points **only after the confirm step** (the API requires `confirm: true`). The deduction, stock reservation and redemption record are done with conditional updates and are rolled back if any step fails.
- QR codes encode `CAMPORA-DEMO:CAMP-XXXXXX`. They are demo tokens with no real-world value.

## 9. Design decisions to know about

- **Verified badge** is a manual demo flag set in the seed data. New accounts are never verified, and users cannot change it. It does not check real credentials.
- **Seeker reward points:** the brief lists "available reward points" on the Seeker dashboard, so Seekers receive a small thank-you bonus (`POINTS_SEEKER_BONUS`, default 2, set 0 to disable) when one of their requests is completed. The demo Seeker starts with 35 points. Both roles can redeem benefits; Helpers earn most of the points.
- **Chat** uses simple REST with 4-second polling (no WebSockets). Chat is only allowed between a Seeker and a Helper with an accepted connection.
- **Public posts:** a Helper who rejects one only hides it for themselves; it stays open for others. The first Helper to accept it becomes the assigned Helper.
- **Security level:** passwords are hashed with bcrypt, sessions use JWTs, role checks are enforced on the server, user text is HTML-escaped in the UI, and login is rate limited. It is still a prototype: the token is kept in `localStorage`, there is no email verification or password reset, and you should set your own `JWT_SECRET`.

## 10. Useful commands

```bash
npm start          # run the server
npm run dev        # run with auto-restart (nodemon)
npm run seed       # reset the database to the demo data
npm run smoke      # API end-to-end check (server must be running; it adds a little data, run seed to reset)
```

## 11. Troubleshooting

- **`ECONNREFUSED 127.0.0.1:27017`:** MongoDB is not running. Start the service, or set `MONGODB_URI` to your Atlas string.
- **Atlas: `bad auth` or timeout:** check the username/password (URL-encode special characters) and that your IP is allowed under *Network Access*.
- **Port already in use:** change `PORT` in `.env`.
- **Log in shows "Too many attempts":** wait a few minutes (login is limited to 200 attempts per 15 minutes per IP).
- **Want a clean slate:** `npm run seed`.
- **Google Fonts do not load (offline):** the site falls back to system fonts automatically.

## 12. Help Sessions, Help Rooms and Campus Challenges (new)

Everything below is additive. Existing features, routes, collections and screens are unchanged. The new features reuse the existing points ledger, leaderboard, notifications and announcements.

### Help Sessions (Meeting Request + Help Room)
- **Seeker:** *Help Sessions → Book a session* (or *Book session* on a Helper card or profile). Choose a help type (Resume Review, Coding Help, Project Guidance, Career Guidance, Subject Doubt, Interview Preparation, General Mentorship), a mentor, date, start time, duration and topic.
- **Helper:** accept, reject, or suggest another time. The Seeker can accept or decline the suggestion.
- **On accept** a private Help Room is created and both people are notified with the title, date, time, duration and a *Join Help Room* button. The room opens `ROOM_JOIN_EARLY_MINUTES` (default 5) before the start.
- **Room tools:** video and audio (mic and camera toggles), screen share, shared whiteboard, file sharing (4 MB each), code editor with language select, shared notes, chat, leave, and an end-session button. The header shows the title, both names, date, start and end time and a countdown.
- **Privacy:** only the Seeker and the Helper can open a room; anyone else gets a 404. One room belongs to exactly one meeting.
- **No permanent rooms:** at the scheduled end the room is archived automatically (a background scheduler, plus a check on every access). Archived rooms are read-only; notes, whiteboard, code, chat and files stay available to both people.
- **Notifications:** request received, accepted, rejected, reminder, room ready, starting soon, session ended. Each is sent once.

### Video and the real-time layer
- Video, audio and screen share use browser WebRTC. The server only relays signalling messages (`/api/rooms/:code/signal`).
- Chat, whiteboard, notes, code and presence use short polling (about 1.6 s), in line with the existing chat.
- Browsers allow the camera only on **HTTPS or localhost**. On strict networks a TURN server is needed: set `ICE_SERVERS` (see `.env.example`).
- All media code is in `public/js/room/media.js` behind a small interface (`start`, `handleSignal`, `toggleMic`, `toggleCam`, `startScreen`, `stopScreen`, `destroy`), so a hosted video service can replace that one file later.
- If the camera or microphone is blocked, the room still works for chat and the shared tools.

### Campus Challenges and streaks
- *Campus Challenges* shows the streak, this week's progress, weekly and total points, Today's Challenge, the weekly list with category filters and difficulty, and a weekly leaderboard.
- Each week draws 5 challenges from a pool of about 26 (2 easy, 2 medium, 1 hard, category spread, at most one event challenge). Recent challenges are less likely to return, so weeks do not repeat. Points follow difficulty.
- **Streak points:** day 1 +5, day 2 +10, day 3 onward +15 (capped), +25 bonus on day 5, +50 on every 7th day. Paid once per day.
- **Anti-abuse:** every challenge pays once (unique index plus compare-and-set), self-reported completions are capped per day (`CHALLENGE_MAX_SELF_PER_DAY`), and challenges that can be verified are verified from real activity.
- **Integration:** *help a junior* and mentoring challenges complete from completed Help Sessions and Help Requests; *project upload* from posted requests; workshop and club challenges from announcement check-ins (*I attended* on an announcement, available from 2 hours before to 2 days after the event; announcements now have a category).
- **Notifications:** new weekly challenges, challenge completed, streak maintained, streak milestone, weekly challenge ending soon.

### New settings (`.env.example`)
`SESSION_MIN_LEAD_MINUTES`, `SESSION_MAX_DAYS_AHEAD`, `ROOM_JOIN_EARLY_MINUTES`, `ROOM_MAX_FILE_BYTES`, `ICE_SERVERS`, `SCHEDULER`, `CHALLENGE_WEEKLY_SIZE`, `CHALLENGE_TZ`, `CHALLENGE_MAX_SELF_PER_DAY`.

### New API
- Sessions: `GET /api/sessions/meta`, `GET /api/sessions`, `POST /api/sessions/requests`, `POST /api/sessions/requests/:id/{accept|reject|suggest|cancel}`
- Rooms: `GET /api/rooms/:code`, `POST …/join`, `…/leave`, `GET …/sync`, `POST …/chat`, `…/strokes`, `…/clear`, `…/undo`, `PUT …/notes`, `PUT …/code`, `POST …/signal`, `POST …/files`, `GET …/files/:fileId`, `POST …/end`
- Challenges: `GET /api/challenges`, `GET /api/challenges/summary`, `GET /api/challenges/leaderboard`, `POST /api/challenges/complete`
- Announcements: `POST /api/announcements/:id/checkin`, `GET /api/announcements/checkins/mine`

### Demo data and tests
`npm run seed` adds example announcements, challenge weeks, a streak, and three sessions for `seeker_demo` (accepted, pending, and a completed one with notes, code and chat).

```bash
npm run smoke:features   # 115 checks. Start the server on a freshly seeded database with:
                         #   ROOM_JOIN_EARLY_MINUTES=60 SESSION_MIN_LEAD_MINUTES=1 npm start
npm run smoke            # the original 66 checks (run on a fresh seed too)
```
Both suites add a little data, so run `npm run seed` between them.
