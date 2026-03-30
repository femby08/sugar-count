#!/bin/bash
# Sugar Counter — Build correcto para Android
# El problema del "layout antiguo" ocurre porque `npx cap sync`
# NO siempre copia el dist/ actualizado. Hay que usar `cap copy` primero.

echo "🔨 Building..."
npm run build

echo "📦 Copying dist/ to Android assets..."
npx cap copy android

echo "🔌 Syncing Capacitor plugins..."
npx cap sync android

echo "✅ Listo. Abre Android Studio o ejecuta: npx cap open android"
