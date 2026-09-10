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

Build alındığında (`npm run build`) ortaya sadece statik dosyalar (`dist/`) çıkar; bu dosyalar herhangi bir statik web sunucusuyla (nginx, Apache, vb.) servis edilebilir. Bir Node.js runtime'ına ihtiyaç yoktur — sadece nginx'in `/api/rag/` ve `/api/locate` için proxy kuralları tanımlaması gerekir (bkz. KURULUM.md adım 6).

## Routing

`react-router-dom` ile iki bağımsız sayfa var, aralarında navigasyon linki yok (bilinçli tercih — iki farklı araç, ayrı ayrı adreslerinden açılıyor):

| Path            | Bileşen        | Amaç                                  |
|-----------------|-----------------|-----------------------------------------|
| `/`             | `Chat`          | Soru-cevap sohbet asistanı              |
| `/dosya-arama`  | `FileLocator`   | Doküman/dosya konumu arama              |

nginx'in mevcut `try_files $uri $uri/ /index.html;` kuralı SPA route'ları için zaten yeterli — `/dosya-arama` gibi bir path'e doğrudan girilse bile `index.html` servis edilir, React Router tarayıcıda doğru sayfayı render eder. Ekstra bir nginx değişikliği gerekmez.

## Dosya Yapısı

```
rag-frontend/
├── index.html              Uygulamanın HTML kabuğu, <title>/<meta> etiketleri
├── vite.config.js          Vite yapılandırması (React plugin, dev port 5173)
├── package.json            Bağımlılıklar ve npm script'leri
└── src/
    ├── main.jsx             Giriş noktası: React root'u oluşturur, global CSS'leri import eder
    ├── App.jsx               Kök bileşen — react-router-dom ile route tanımları (/, /dosya-arama)
    ├── App.css               Global reset + CSS değişkenleri (renk paleti, tema)
    ├── assets/
    │   └── logo.png          Mersin Üniversitesi logosu
    └── components/
        ├── Chat.jsx           Sohbet state'i, API çağrısı, mesaj akışı UI'ı (route: /)
        ├── Chat.css           Chat.jsx'e özel stiller
        ├── Sidebar.jsx        Geçmiş listesi — hem Chat hem FileLocator kullanır (prop'larla parametrik)
        ├── Sidebar.css        Sidebar.jsx'e özel stiller
        ├── FileLocator.jsx    Doküman arama state'i, API çağrısı, sonuç listesi UI'ı (route: /dosya-arama)
        └── FileLocator.css    Sadece sonuç listesine özel stiller (bkz. aşağıda)
```

`Chat` içindeki geçmiş sohbetler arasında geçiş routing ile değil, `Sidebar`'ın `Chat` state'ini prop üzerinden değiştirmesiyle yapılır (bkz. aşağıda "Sohbet Geçmişi") — routing sadece `Chat` ile `FileLocator` gibi tamamen farklı araçlar arasında kullanılıyor.

## `FileLocator.jsx` İçindeki Akış

**Topbar, boş ekran, arama kutusu ve sidebar `Chat.css`'in/`Sidebar`'ın kendi sınıflarını (`chat-app`, `chat-topbar`, `chat-empty-state`, `chat-input-form`, `chat-send-btn`, `Sidebar` bileşeni vb.) doğrudan kullanır** — ayrı, "benzer ama farklı" bir stil seti tutulmuyor, böylece iki sayfa görsel olarak birebir aynı kalıyor ve Chat.css'te yapılan bir değişiklik otomatik olarak buraya da yansır. `FileLocator.css` sadece Chat'te karşılığı olmayan kısımlara (sonuç kartları listesi) özeldir.

`Sidebar` bileşeni artık parametrik (`newLabel`, `emptyLabel`, `deleteLabel` prop'ları) — `Chat.jsx` varsayılanları ("Yeni Sohbet" vb.) kullanır, `FileLocator.jsx` kendi metinlerini ("Yeni Arama", "Henüz arama geçmişi yok") geçer. Aynı bileşen, iki farklı context'te.

- **İstek:** `POST /api/locate` → nginx proxy → gerçek locate API'si, gövde `{ "question": "<arama metni>" }`, header `X-API-Key`.
- **Yanıt (200):** JSON dizi — her eleman `{ title, fileName, location, url, distance, text }`. `text`, o bölümün ham içeriğidir (input olarak backend'e verilen kaynak metin). `distance` (benzerlik skoru, küçük = daha alakalı) arayüzde gösterilmiyor, sadece backend'in sonuçları zaten alakalılığa göre sıralı döndürdüğü varsayılıyor.
- **Split-view sonuç ekranı:** Bir sonuca tıklamak artık dosyayı açmaz — `selectedIndex` state'i set edilir, sağda bir içerik paneli açılır (liste sola daralır, `.locator-split-active`). Panel `text` alanını gösterir; dosyayı asıl görüntülemek için panel içindeki ayrı "Dosyayı Görüntüle" butonuna tıklamak gerekir (Google Docs Viewer'a yönlendirir). Panel kapatma (X) `selectedIndex`'i `null`'a döndürür, liste tekrar tam genişliğe döner.
- **Hata durumları:** `Chat.jsx` ile aynı prensip — ham backend gövdesi hiç gösterilmez, sadece durum koduna göre sabit kullanıcı dostu mesaj (`5xx` / diğer) veya "Bağlantı hatası".
- **Arama geçmişi:** `Chat.jsx`'teki sohbet geçmişiyle aynı desen — `localStorage` anahtarı `meu-dosya-arama-gecmisi`. Sadece **başarılı** (sonuç dönen) aramalar kaydedilir; hatalı/boş aramalar geçmişe girmez. Bir geçmiş kaydına tıklamak backend'e tekrar istek atmaz, o aramanın kayıtlı `results`'ını doğrudan gösterir (`text` alanı dahil, kaydedilmiş haliyle). "Yeni Arama" ve çöp kutusu ikonuyla silme, `Chat.jsx`'teki `newChat`/`deleteConversation` ile birebir aynı mantıkta.
- **State:** `query`, `loading`, `searched`, `results`, `error`, `searches` (geçmiş liste), `activeId`, `sidebarOpen`, `selectedIndex` (split-view'da açık olan sonucun index'i).

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
