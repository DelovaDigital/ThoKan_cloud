# Native App Setup (iOS & Android)

Dit project is nu klaar voor native iOS en Android build via **Capacitor**. De volgende stappen zullen je helpen om de native apps te bundelen.

## ⚠️ Prerequisites

### Mac (voor iOS development)
- Xcode 15+
- Cocoapods: `sudo gem install cocoapods`
- Node.js 18+

### Android Development
- Android Studio (installeert Android SDK, NDK, etc.)
- Java 11+
- ANDROID_HOME environment variable ingesteld

## 📱 Setup Stappen

### 1. Dependencies installeren (in `frontend/` folder)

```bash
cd frontend
npm install
```

### 2. Next.js build voor native

**Voor lokale development op phone:**
```bash
npm run build
```

**Capacitor verwacht de static files in `out/` folder:**
```bash
# Dit is al ingesteld in next.config.ts (export mode)
npm run build
```

### 3. iOS App Setup

```bash
# Voeg iOS platform toe (eenmalig)
npm run capacitor:add:ios  # of: npx cap add ios

# Build Next.js en sync naar iOS
npm run capacitor:build:ios

# Open Xcode om te builden/testen
npm run capacitor:open:ios
```

**In Xcode:**
1. Select target "App" → General tab
2. Zet "Minimum Deployment" op iOS 15.0+
3. Zet je Development Team
4. Zet Bundle Identifier (al ingesteld: `com.thokan.cloud`)
5. Klik "Product" → "Run" om te builden op device/simulator

### 4. Android App Setup

```bash
# Voeg Android platform toe (eenmalig)
npm run capacitor:add:android  # of: npx cap add android

# Build Next.js en sync naar Android
npm run capacitor:build:android

# Open Android Studio
npm run capacitor:open:android
```

**In Android Studio:**
1. Zet compileSdkVersion op 35+
2. Zet AGP (Android Gradle Plugin) op 8.3+
3. Klik "Run" → target device/emulator

### 5. Continuous Development

Na eerste setup, voor dagelijks development:

```bash
# Maak changes in Next.js
npm run dev  # of npm run build

# Sync changes naar native
npm run capacitor:sync

# Herstart app op device (in Xcode/Android Studio)
```

## 🔧 Configuratie

**App metadata staat in:**
- `capacitor.config.ts` - App ID, name, build output paths

**Web manifest staat in:**
- `public/manifest.webmanifest` - PWA icons, theme colors (ook gebruikt door native build)

**Service Worker staat in:**
- `public/sw.js` - Offline support & caching

## 📦 Distribution

### iOS (TestFlight / App Store)
```bash
npm run capacitor:open:ios
# In Xcode: Product → Archive → Upload
```

### Android (Play Store / Firebase)
```bash
npm run capacitor:open:android
# In Android Studio: Build → Generate Signed Bundle/APK
```

## 🐛 Troubleshooting

**"Pod install failed" (iOS)**
```bash
cd ios/App
rm -rf Pods Podfile.lock
pod repo update
pod install
cd ../..
```

**"Build failed" (Android)**
```bash
cd android
./gradlew clean build --stacktrace
cd ..
```

**App crashes bij startup**
- Check console output in Xcode/Android Studio
- Zorg dat API backend draait en CORS voor `http://localhost:8000` is ingesteld
- Check dass JWT token correct wordt meegepast in auth headers

## 📚 Meer info

- [Capacitor docs](https://capacitorjs.com/)
- [Next.js static export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)
- [iOS deployment](https://capacitorjs.com/docs/ios)
- [Android deployment](https://capacitorjs.com/docs/android)

---

**Note:** Deze setup bouwt dezelfde React/TypeScript code voor native als voor web, dus geen code duplicatie!
