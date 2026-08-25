# Mersin Üniversitesi — Bilgi Sistemi

Mersin Üniversitesi için yapay zeka destekli, sohbet tarzında bir soru-cevap arayüzü. Kullanıcılar üniversiteyle ilgili sorularını doğal dilde sorar, yanıt bir RAG (Retrieval-Augmented Generation) servisinden alınır.

## Özellikler

- Tam ekran, tek sayfalık sohbet arayüzü (sidebar/geçmiş yönetimi yok — sade tek oturum)
- Otomatik büyüyen mesaj kutusu, örnek soru önerileri
- Sunucudan gelen içerik/uygunluk hatalarının (örn. argo/küfür reddi) kullanıcıya olduğu gibi yansıtılması
- Mersin Üniversitesi kurumsal kimliğine uygun logo ve renk paleti

## Teknoloji

- [React 18](https://react.dev/)
- [Vite 6](https://vite.dev/) — geliştirme sunucusu ve build aracı
- [Bootstrap Icons](https://icons.getbootstrap.com/) — ikonlar
- Backend: harici bir RAG API'si (`/rag/ask`) — bu repo sadece frontend'i içerir

## Hızlı Başlangıç

```bash
npm install
npm run dev
```

Uygulama varsayılan olarak [http://localhost:5173](http://localhost:5173) adresinde açılır.

## Komutlar

| Komut             | Açıklama                                      |
|-------------------|------------------------------------------------|
| `npm run dev`     | Geliştirme sunucusunu başlatır (hot reload)     |
| `npm run build`   | Production build'i `dist/` klasörüne çıkarır    |
| `npm run preview` | Build edilmiş `dist/` içeriğini yerelde sunar   |

## Proje Yapısı ve Backend Bağlantısı

Kod organizasyonu, state akışı ve backend ile iletişim detayları için: **[MIMARI.md](MIMARI.md)**

## Sunucuya Kurulum (SSH)

Uzak bir sunucuya uçtan uca kurulum adımları için: **[KURULUM.md](KURULUM.md)**

## Güvenlik Notu

Bu uygulama tamamen istemci taraflı (client-side) çalışır. Production kurulumunda nginx, `/api/rag/ask` isteğini backend'e proxy'ler (bkz. KURULUM.md adım 6) — ama bu sadece CORS'u aşmak içindir, anahtarı gizlemez: `X-API-Key` değeri hâlâ tarayıcıdan gönderilir ve hem Network sekmesinde hem derlenmiş JS dosyasında görünür durumdadır. Anahtarın tamamen gizlenmesi isteniyorsa proxy bloğuna `proxy_set_header X-API-Key ...;` eklenip anahtar istemci kodundan çıkarılmalıdır — bu repo şu an bunu yapmıyor, bilinçli bir tercih olarak basitlik seçilmiştir.
