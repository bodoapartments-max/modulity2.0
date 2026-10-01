# Modulity 2.0 — Firebase Development Setup

Modulity 2.0 uses a **separate** Firebase development project. Do not use the Modulity V1 production project.

## Create a Firebase project for development

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project (e.g. `modulity2-dev`).
3. Enable **Authentication** and select **Email/Password** provider.
4. (Optional) Enable Authentication Emulator for local development.
5. Register a web app in the project.

## Configure the application

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in the Firebase values from your new project:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## Run locally

```bash
npm install
npm run dev
```

## Authentication emulator (optional)

To use the Firebase Auth Emulator locally, set:

```env
VITE_FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
```

Start the emulator with `firebase emulators:start --only auth`.

## Security notes

- Never commit `.env` or real Firebase credentials.
- `.env.example` contains only placeholder values and is safe to commit.
- Firebase service account keys and admin credentials belong to the deployment environment, not the repository.
