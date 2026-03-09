# Logo bestanden plaatsen

Plaats je .png logo bestanden in de `frontend/public/` map:

## Benodigde bestanden:

- **favicon.png** (48x48 of 64x64 pixels) - Hoofdfavicon
- **favicon-16x16.png** (16x16 pixels) - Kleine favicon
- **favicon-32x32.png** (32x32 pixels) - Middelgrote favicon
- **apple-touch-icon.png** (180x180 pixels) - Apple touch icon (optioneel)

## Logo in sidebar:

Het logo in de sidebar (TK badge) is momenteel een CSS gradient met tekst.
Als je een .png wilt gebruiken:

1. Plaats je logo in `frontend/public/logo.png`
2. Update `frontend/components/layout-shell.tsx` om een `<img>` tag te gebruiken

##Voorbeeld:

```bash
frontend/public/
├── favicon.png
├── favicon-16x16.png
├── favicon-32x32.png
├── apple-touch-icon.png (optioneel)
└── logo.png (optioneel, voor sidebar)
```

## Na plaatsen van bestanden:

```bash
docker compose build frontend
docker compose up -d frontend
```
