# Sunucuya Kurulum Rehberi (SSH)

Bu doküman, projeyi uzak bir Linux sunucusuna (Ubuntu/Debian varsayılarak) SSH ile bağlanıp uçtan uca yayına almayı anlatır. Uygulama build alındıktan sonra **saf statik dosyalardan** oluşur; sunucuda Node.js sadece build almak için gereklidir, çalışma zamanında (runtime) gerekmez.

## 0. Ön Koşullar

- Sunucuya SSH erişimi (kullanıcı adı, IP/host, anahtar veya parola)
- Sunucunun RAG API'sine (Sunucu adresi) ağ erişimi olması (aynı iç ağda değilse bu adım engelleyici olur — önceden doğrulayın)
- Projenin bir GitHub reposunda olması (veya dosyaları `scp` ile taşımaya hazır olmanız)

## 1. Sunucuya Bağlanma

```bash
ssh kullanici_adi@sunucu_ip
```

## 2. Node.js Kurulumu

Build almak için Node.js 18+ gereklidir (proje `"type": "module"` ve modern Vite 6 kullanıyor).

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v20.x görünmeli
npm -v
```

## 3. Gerekli Paketler

```bash
sudo apt-get update
sudo apt-get install -y git nginx
```

## 4. Projeyi Sunucuya Alma

```bash
cd /var/www
sudo git clone https://github.com/<kullanici-adi>/<repo-adi>.git meu-bilgi-sistemi
cd meu-bilgi-sistemi
```

GitHub yerine dosyaları yerelden taşımak isterseniz:

```bash
# Yerel makinede:
scp -r ./rag-frontend kullanici_adi@sunucu_ip:/var/www/meu-bilgi-sistemi
```

## 5. Bağımlılıkları Kurma ve Build Alma

```bash
cd /var/www/meu-bilgi-sistemi
npm install
npm run build
```

Bu komut `dist/` klasörünü oluşturur — nginx'in servis edeceği içerik budur.

## 6. Nginx Yapılandırması

Yeni bir site config dosyası oluşturun:

```bash
sudo nano /etc/nginx/sites-available/meu-bilgi-sistemi
```

İçeriği:

```nginx
server {
    listen 80;
    server_name sunucu-domain-veya-ip;

    root /var/www/meu-bilgi-sistemi/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Frontend, RAG API'sine bu path üzerinden (aynı origin) istek atar.
    # Böylece tarayıcı için cross-origin istek olmaz, CORS hatası alınmaz.
    # Sadece /ask ile eşleşir (exact match) — backend'deki /rag/ altında
    # başka endpoint varsa onlar bu yoldan erişilebilir olmaz, saldırı
    # yüzeyi minimumda tutulur. RAG API bu sunucuda farklı bir portta
    # çalışıyorsa 127.0.0.1:PORT kısmını gerçek portla değiştirin; başka
    # bir sunucudaysa o sunucunun adresini yazın (bu durumda backend'in
    # CORS'a izin vermesi gerekir).
    location = /api/rag/ask {
        proxy_pass http://127.0.0.1:8080/rag/ask;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
```

Etkinleştirin ve nginx'i yeniden başlatın:

```bash
sudo ln -s /etc/nginx/sites-available/meu-bilgi-sistemi /etc/nginx/sites-enabled/
sudo nginx -t          # config söz dizimi kontrolü
sudo systemctl reload nginx
```

## 7. Güvenlik Duvarı

```bash
sudo ufw allow 'Nginx Full'   # 80 ve 443 portlarını açar
sudo ufw status
```

## 8. HTTPS (Önerilir)

Bir domain adınız varsa Let's Encrypt ile ücretsiz sertifika:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d domain-adiniz.com
```

## 9. Doğrulama

Tarayıcıdan sunucu adresine gidin, boş sohbet ekranının açıldığını ve bir soru sorduğunuzda RAG API'sinden (Sunucu adresi) yanıt geldiğini doğrulayın. Yanıt gelmiyorsa:

```bash
curl -v -X POST "Sunucu adresi" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: API Anahtarı" \
  -d '{"question":"test"}'
```

komutunu sunucu üzerinden çalıştırarak RAG API'sine ağ erişiminin olduğunu kontrol edin.

## 10. Güncelleme (Yeni Sürüm Yayınlama)

```bash
cd /var/www/meu-bilgi-sistemi
git pull
npm install
npm run build
```

`dist/` klasörü yeniden oluşturulduğu an nginx otomatik olarak güncel dosyaları servis eder — nginx'i yeniden başlatmaya gerek yoktur (statik dosya değişimi anlıktır).

## Güvenlik Notu

6. adımdaki `/api/rag/` proxy bloğu **sadece CORS hatasını önlemek** için var — istek tarayıcıdan aynı origin'e (kendi adresine) gidip nginx tarafından sunucu içinde backend'e yönlendiriliyor. Bu, `X-API-Key` değerini gizlemez: istek hâlâ tarayıcıdan `X-API-Key` header'ıyla gönderiliyor ve nginx bunu olduğu gibi backend'e iletiyor. Anahtar hem derlenmiş JS dosyasında (`src/components/Chat.jsx` içinde `API_KEY` sabiti) hem de tarayıcının DevTools → Network sekmesinde düz metin olarak görülebilir durumda.

Anahtarı gerçekten gizlemek isterseniz, nginx'in proxy bloğuna `proxy_set_header X-API-Key <anahtar>;` ekleyip anahtarı frontend kaynak kodundan tamamen çıkarmanız gerekir — bu durumda anahtar sadece nginx config dosyasında (sunucu tarafında) durur, hiçbir zaman tarayıcıya gitmez. Bu repo şu an bunu yapmıyor; bilinçli olarak basitlik tercih edilmiştir.
