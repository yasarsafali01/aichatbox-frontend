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
        ├── Chat.jsx           Sohbet state'i, API çağrısı, mesaj akışı UI'ı
        ├── Chat.css           Chat.jsx'e özel stiller
        ├── Sidebar.jsx        Geçmiş sohbet listesi (Chat.jsx'ten prop olarak veri alır)
        └── Sidebar.css        Sidebar.jsx'e özel stiller
```

Sayfa geçişi/routing yoktur — tek route, tek `Chat` bileşeni. Geçmiş sohbetler arasında geçiş, routing yerine `Sidebar`'ın `Chat` state'ini prop üzerinden değiştirmesiyle yapılır (bkz. aşağıda "Sohbet Geçmişi").

## `Chat.jsx` İçindeki Akış

### State

| State           | Amaç                                                              |
|-----------------|--------------------------------------------------------------------|
| `messages`      | Aktif sohbetin mesajları: `{ role: 'user' \| 'bot', text, error? }` dizisi |
| `input`         | Textarea'nın anlık değeri                                          |
| `loading`       | İstek beklenirken `true`; gönder butonunu ve input'u kilitler      |
| `conversations` | Kayıtlı tüm sohbetler: `{ id, title, messages, updatedAt }` dizisi (localStorage ile senkron) |
| `activeId`      | Şu an açık olan sohbetin `id`'si; `null` ise henüz kaydedilmemiş yeni sohbet |
| `sidebarOpen`   | Sadece mobilde (≤768px) sidebar'ın overlay olarak açık/kapalı durumu |

`messages` boşken (`hasStarted === false`) merkezi "hoş geldin" ekranı gösterilir (logo + başlık + örnek sorular). İlk mesaj gönderildiğinde standart, alta sabitlenmiş sohbet akışına geçilir.

### Sohbet Geçmişi (`Sidebar`, localStorage)

Her sohbet `localStorage`'da `meu-bilgi-sistemi-conversations` anahtarı altında bir JSON dizi olarak tutulur — backend'e hiç gönderilmez, sadece tarayıcıda kalır.

- **İlk mesaj gönderildiğinde** (`activeId === null`) yeni bir sohbet kaydı oluşturulur; başlık ilk kullanıcı mesajından türetilir (`makeTitle`, 42 karaktere kırpılır).
- Bir `useEffect` (`[messages, activeId]` dep'i), `messages` her değiştiğinde aktif sohbetin kaydını günceller ve `localStorage`'a yazar — ayrı bir "kaydet" butonu yoktur, her mesaj otomatik kalıcı hale gelir.
- `Sidebar`'dan bir geçmiş sohbete tıklamak (`selectConversation`) o kaydın `messages`'ını aktif hale getirir; "Yeni Sohbet" (`newChat`) `activeId`'yi `null`'a döndürüp ekranı temizler (yeni mesaj gelene kadar kayıt oluşmaz).
- Çöp kutusu ikonuyla silme (`deleteConversation`) kaydı diziden çıkarıp `localStorage`'ı günceller.
- `localStorage` erişimi başarısız olursa (gizli sekme, kota dolu vb.) `loadConversations`/`saveConversations` sessizce boş diziye düşer — uygulama çökmez, sadece geçmiş kalıcı olmaz.

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
- **HTTP 4xx/5xx** → gövde hiç okunmaz/gösterilmez (backend'in ham hata metni, stack trace'i veya nginx'in ürettiği HTML hata sayfası kullanıcıya asla yansıtılmaz). Sadece durum koduna göre sabit, kullanıcı dostu tek bir mesaj gösterilir: `5xx` için "Sunucu şu anda yanıt veremiyor...", diğer hatalar (`4xx`) için "İsteğiniz işlenemedi..." (`pushError`).
- **Ağ hatası** (fetch reddi — backend'e ulaşılamıyor) → sabit "Bağlantı hatası" mesajı gösterilir.
- **İstek iptali** (`AbortError` — kullanıcı sohbetten ayrıldı veya durdur butonuna bastı) → sessizce çıkılır, hiçbir mesaj eklenmez.

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
- **Sohbet geçmişini sunucuda saklamak** (kullanıcı hesabına bağlı, cihazlar arası senkron) gerekirse `localStorage` yerine bir backend endpoint'i (`GET/POST/DELETE /conversations`) kullanılmalı — şu anki tasarım bilinçli olarak sadece tarayıcı yerelinde tutuyor, kimlik doğrulama/kullanıcı hesabı yok.
