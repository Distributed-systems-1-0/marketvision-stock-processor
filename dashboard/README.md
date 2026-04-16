# MarketVision Dashboard

This dashboard displays:

- Live processed stock ticks from Firestore (`processed_ticks`)
- System metrics from Realtime Database (`system/metrics`)
- AI prediction data from Realtime Database (`system/prediction`)
- Auto-scaling timeline from Realtime Database (`system/scaling_events`)

## Run

1. Install dependencies:

   npm install

2. Start dashboard (port 3001):

   npm start

3. Build for production:

   npm run build

## Firebase Credentials

- Frontend uses Firebase Web SDK config in `src/firebase.js`.
- Never place Firebase Admin private keys in frontend files.

For backend worker (`worker/consumer.js`), use your Node.js service account key path in a local `.env`:

FIREBASE_SERVICE_ACCOUNT_PATH=../marketvision-stock-processor-firebase-adminsdk-fbsvc-85ccfd599b.json

If your key is named differently, replace with the correct filename.
