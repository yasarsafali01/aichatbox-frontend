# Proje Mimarisi ve Çalışma Yapısı

Bu doküman, projenin dosya organizasyonunu, veri akışını ve önemli tasarım kararlarını açıklar.

## Genel Bakış

Proje, **saf istemci taraflı (client-side) bir Single Page Application (SPA)**'dır. Kendi backend'i yoktur. Tarayıcı isteği kendi origin'ine (`/api/rag/ask`) atar; bu path'i nginx sunucu içinde gerçek RAG API'sine yönlendirir (reverse proxy). Bu dolaylı yol bilinçli bir tercih: tarayıcı ile RAG API'si farklı portlarda olduğu için doğrudan çağrı **CORS hatasına** yol açıyordu, nginx araya girince istek tarayıcı açısından aynı origin'e gitmiş oluyor ve CORS devre dışı kalıyor.

```
┌─────────────┐   POST /api/rag/ask   ┌──────────────┐   POST /rag/ask   ┌──────────────────────┐
│   Tarayıcı   │ ─────────────────────▶ │    nginx     │ ─────────────────▶ │  RAG API              │
│ (React SPA)  │   (aynı origin)        │ (reverse     │   (sunucu içinde)   │  (Sunucu adresi)      │
│              │   header: X-API-Key    │  proxy)      │   header: X-API-Key │  bu reponun dışında   │
│              │ ◀───────────────────── │              │ ◀─────────────────  │                       │
└─────────────┘   200: düz metin cevap  └──────────────┘                     └──────────────────────┘
                   400/500: { "error": "..." } veya düz metin
```

`X-API-Key` değeri nginx tarafından eklenmiyor — tarayıcı isteği hâlâ bu header ile gönderiyor, nginx sadece olduğu gibi iletiyor (bkz. KURULUM.md → Güvenlik Notu). Proxy'nin tek amacı CORS'u aşmak, anahtarı gizlemek değil.

Build alındığında (`npm run build`) ortaya sadece statik dosyalar (`dist/`) çıkar; bu dosyalar herhangi bir statik web sunucusuyla (nginx, Apache, vb.) servis edilebilir. Bir Node.js runtime'ına ihtiyaç yoktur — sadece nginx'in `/api/rag/` için bir proxy kuralı tanımlaması gerekir (bkz. KURULUM.md adım 6).

## Dosya Yapısı

```
rag-frontend/
├── index.html              Uygulamanın HTML kabuğu, <title>/<meta> etiketleri
├── vite.config.js          Vite yapılandırması (React plugin, dev port 5173)
├── package.json            Bağımlılıklar ve npm script'leri
└── src/
    ├── main.jsx             Giriş noktası: React root'u oluşturur, global CSS'leri import eder
    ├── App.jsx               Kök bileşen — sadece <Chat /> render eder
    ├── App.css               Global reset + CSS değişkenleri (renk paleti, tema)
    ├── assets/
    │   └── logo.png          Mersin Üniversitesi logosu
    └── components/
        ├── Chat.jsx           Uygulamanın tamamı: sohbet state'i, API çağrısı, UI
        └── Chat.css           Chat.jsx'e özel stiller
```

Bilinçli olarak tek bir "Chat" bileşeni etrafında toplanmıştır — sayfa geçişi, routing veya çoklu sohbet geçmişi yoktur (ürün kararı: sade tek oturumluk sohbet ekranı).

## `Chat.jsx` İçindeki Akış

### State

| State           | Amaç                                                              |
|-----------------|--------------------------------------------------------------------|
| `messages`      | Sohbet geçmişi: `{ role: 'user' \| 'bot', text, error? }` dizisi   |
| `input`         | Textarea'nın anlık değeri                                          |
| `loading`       | İstek beklenirken `true`; gönder butonunu ve input'u kilitler      |

`messages` boşken (`hasStarted === false`) merkezi "hoş geldin" ekranı gösterilir (logo + başlık + örnek sorular). İlk mesaj gönderildiğinde standart, alta sabitlenmiş sohbet akışına geçilir.

### Backend İsteği (`ask` fonksiyonu)

Sabitler dosyanın en üstünde tanımlıdır:

```js
const ASK_URL = '/api/rag/ask'   // nginx tarafından backend'e proxy'lenir
const API_KEY = 'API Anahtarı'
```

İstek formatı:

```js
fetch(ASK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  body: JSON.stringify({ question: text }),
})
```

Yanıt işleme mantığı:

- **HTTP 200** → gövde düz metin olarak okunur ve asistan mesajı olarak eklenir (`pushBot`).
- **HTTP 400/500 vb.** → gövde önce JSON olarak parse edilmeye çalışılır; `error` alanı varsa o metin, yoksa ham gövde, o da yoksa genel `Sunucu hatası (HTTP xxx)` mesajı hata balonu olarak gösterilir (`pushError`).
- **Ağ hatası** (fetch reddi — backend'e ulaşılamıyor) → sabit "Bağlantı hatası" mesajı gösterilir.

Bu ayrım önemlidir: sunucudan dönen anlamlı hata mesajları (örn. içerik uygunluk reddi) kullanıcıya olduğu gibi yansıtılırken, gerçek altyapı hataları genel bir mesajla örtülür.

### UI Bileşenleri (tek dosyada, JSX içinde satır içi)

- **Topbar** — logo + marka adı, sohbet başladıysa "Yeni Sohbet" butonu (state'i sıfırlar, geçmişi silmez/saklamaz).
- **Boş durum (`chat-empty-state`)** — büyük logo, başlık, composer, tıklanabilir örnek soru çipleri (`SUGGESTIONS` dizisi).
- **Sohbet akışı (`chat-thread`)** — kullanıcı mesajları sağda gri balon, asistan mesajları solda düz metin + avatar; yükleniyor durumunda "yazıyor" animasyonu.
- **Composer** — otomatik yükseklik ayarlanan `<textarea>` + gönder butonu; Enter ile gönder, Shift+Enter ile yeni satır.

## Tema / Renk Sistemi

`src/App.css` içinde CSS değişkenleri olarak tanımlıdır:

```css
--navy-dark, --navy, --navy-light   /* Mersin Üniversitesi lacivert tonları */
--accent                             /* turuncu vurgu rengi (logo ile uyumlu) */
--chat-bg, --chat-border             /* nötr arka plan/kenarlık tonları */
```

Renk veya marka değişikliği gerektiğinde tek değişiklik noktası burasıdır; bileşenler doğrudan renk kodu kullanmaz.

## Genişletme Notları

- **Yeni bir sayfa/route eklemek** gerekirse `react-router` eklenmeli; şu an hiç routing yoktur.
- **API anahtarını gizlemek** gerekirse mevcut nginx proxy bloğuna (`/api/rag/`) `proxy_set_header X-API-Key ...;` eklenip `API_KEY` sabitinin istemci kodundan tamamen çıkarılması yeterlidir — proxy zaten var, sadece anahtarı ekleyen taraf değişir (bkz. KURULUM.md → Güvenlik Notu).
- **Çoklu sohbet / geçmiş** gibi bir ihtiyaç doğarsa `messages` state'i `localStorage`'a taşınıp bir sohbet listesi state'i eklenebilir; şu anki tasarım bilinçli olarak bunu içermiyor.
