---
title: Lightweight PHP/HTML + MariaDB Deployment
description: Guide för traditionell webhost deployment med PHP 8.3+, MariaDB och minimala dependencies
tags: [php, mariadb, webhost, deployment, lightweight, security, mvc]
---

# Lightweight PHP/HTML + MariaDB Deployment

En guide för enkla projekt som inte behöver Next.js eller tunga ramverk. Perfekt för billiga webhosts (cPanel, DirectAdmin) som bara har PHP.

## När ska man välja detta vs Next.js?

### Välj PHP/HTML när:
- ✅ Projektet är enkelt (CRUD, formulär, enkla API:er)
- ✅ Budget är begränsad (delad hosting ~50-200 kr/mån)
- ✅ Ingen behöver React/SSR/ISR
- ✅ Statisk HTML + server-side rendering räcker
- ✅ Teamet känner sig bekvämt med PHP
- ✅ Snabb deployment via FTP/SFTP
- ✅ Ingen behov av edge functions eller serverless

### Välj Next.js när:
- ✅ Komplex frontend med React-komponenter
- ✅ SSR/ISR krävs för SEO
- ✅ Edge functions eller serverless
- ✅ Moderna build tools och hot reload
- ✅ Större team med React-expertis
- ✅ Budget för Vercel/Netlify eller egen server

---

## PHP 8.3+ Setup

### Minimal `composer.json`

```json
{
  "name": "projekt/app",
  "description": "Lightweight PHP app",
  "type": "project",
  "require": {
    "php": ">=8.3",
    "ext-pdo": "*",
    "ext-mbstring": "*",
    "ext-json": "*"
  },
  "autoload": {
    "psr-4": {
      "App\\": "src/"
    }
  }
}
```

### Autoloader (`public/index.php`)

```php
<?php
// Autoloader för PSR-4
require_once __DIR__ . '/../vendor/autoload.php';

// Ladda miljövariabler
if (file_exists(__DIR__ . '/../.env')) {
    $lines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
    }
}

// Routing (enkel)
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$requestMethod = $_SERVER['REQUEST_METHOD'];

// Enkel router
if ($requestUri === '/' || $requestUri === '') {
    require __DIR__ . '/../src/views/home.php';
} elseif (strpos($requestUri, '/api/') === 0) {
    // API routes
    $path = substr($requestUri, 5); // Ta bort '/api/'
    $file = __DIR__ . '/api/' . $path . '.php';
    if (file_exists($file)) {
        require $file;
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
    }
} else {
    http_response_code(404);
    echo '404 Not Found';
}
```

---

## MariaDB Setup

### Databaskonfiguration (`src/config/database.php`)

```php
<?php

namespace App\Config;

class Database
{
    private static ?\PDO $connection = null;

    public static function getConnection(): \PDO
    {
        if (self::$connection === null) {
            $host = $_ENV['DB_HOST'] ?? 'localhost';
            $dbname = $_ENV['DB_NAME'] ?? '';
            $username = $_ENV['DB_USER'] ?? '';
            $password = $_ENV['DB_PASS'] ?? '';
            $charset = 'utf8mb4';

            $dsn = "mysql:host={$host};dbname={$dbname};charset={$charset}";
            
            $options = [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
                \PDO::ATTR_EMULATE_PREPARES => false, // Viktigt för säkerhet
                \PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ];

            try {
                self::$connection = new \PDO($dsn, $username, $password, $options);
            } catch (\PDOException $e) {
                error_log("Database connection failed: " . $e->getMessage());
                throw new \RuntimeException("Database connection failed");
            }
        }

        return self::$connection;
    }
}
```

### `.env` exempel

```env
# Database
DB_HOST=localhost
DB_NAME=projekt_db
DB_USER=projekt_user
DB_PASS=starkt_lösenord_123

# App
APP_ENV=production
APP_DEBUG=false
APP_URL=https://example.com

# Security
CSRF_SECRET=slumpmässig_sträng_minst_32_tecken
SESSION_SECRET=annan_slumpmässig_sträng_32_tecken
```

### SQL Schema exempel

```sql
-- Användare
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions (för CSRF)
CREATE TABLE sessions (
    id VARCHAR(128) PRIMARY KEY,
    data TEXT,
    last_activity INT UNSIGNED,
    INDEX idx_last_activity (last_activity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## Säkerhet

### Prepared Statements

```php
<?php
// ❌ FEL - SQL injection risk
$stmt = $pdo->query("SELECT * FROM users WHERE email = '{$email}'");

// ✅ RÄTT - Prepared statement
$stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();
```

### Input Validation (`src/utils/validation.php`)

```php
<?php

namespace App\Utils;

class Validation
{
    public static function email(string $email): bool
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function sanitizeString(string $input, int $maxLength = 255): string
    {
        $input = trim($input);
        $input = htmlspecialchars($input, ENT_QUOTES, 'UTF-8');
        return mb_substr($input, 0, $maxLength);
    }

    public static function sanitizeInt($input): ?int
    {
        $int = filter_var($input, FILTER_VALIDATE_INT);
        return $int !== false ? $int : null;
    }

    public static function validateRequired(array $data, array $required): array
    {
        $errors = [];
        foreach ($required as $field) {
            if (empty($data[$field])) {
                $errors[$field] = "Fältet {$field} är obligatoriskt";
            }
        }
        return $errors;
    }
}
```

### CSRF Protection (`src/middleware/csrf.php`)

```php
<?php

namespace App\Middleware;

class CSRF
{
    public static function generateToken(): string
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        
        return $_SESSION['csrf_token'];
    }

    public static function validateToken(string $token): bool
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        
        if (!isset($_SESSION['csrf_token'])) {
            return false;
        }
        
        return hash_equals($_SESSION['csrf_token'], $token);
    }

    public static function getTokenField(): string
    {
        return '<input type="hidden" name="csrf_token" value="' . 
               htmlspecialchars(self::generateToken()) . '">';
    }
}
```

### Användning i formulär

```php
<!-- Formulär -->
<form method="POST" action="/api/users/create.php">
    <?php echo \App\Middleware\CSRF::getTokenField(); ?>
    <input type="email" name="email" required>
    <input type="password" name="password" required>
    <button type="submit">Skapa</button>
</form>
```

```php
<!-- API endpoint -->
<?php
require_once __DIR__ . '/../../vendor/autoload.php';

use App\Middleware\CSRF;
use App\Utils\Validation;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$token = $_POST['csrf_token'] ?? '';
if (!CSRF::validateToken($token)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid CSRF token']);
    exit;
}

// Fortsätt med validering och databas...
```

---

## Enkel MVC-struktur

### Model (`src/models/User.php`)

```php
<?php

namespace App\Models;

use App\Config\Database;
use PDO;

class User
{
    public int $id;
    public string $email;
    public string $name;
    public string $created_at;

    public static function findByEmail(string $email): ?self
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $data = $stmt->fetch();
        
        if (!$data) {
            return null;
        }
        
        $user = new self();
        $user->id = $data['id'];
        $user->email = $data['email'];
        $user->name = $data['name'];
        $user->created_at = $data['created_at'];
        
        return $user;
    }

    public static function create(array $data): self
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare(
            "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)"
        );
        
        $passwordHash = password_hash($data['password'], PASSWORD_DEFAULT);
        $stmt->execute([
            $data['email'],
            $passwordHash,
            $data['name']
        ]);
        
        $user = new self();
        $user->id = (int)$pdo->lastInsertId();
        $user->email = $data['email'];
        $user->name = $data['name'];
        
        return $user;
    }

    public function verifyPassword(string $password): bool
    {
        $pdo = Database::getConnection();
        $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$this->id]);
        $data = $stmt->fetch();
        
        return password_verify($password, $data['password_hash']);
    }
}
```

### Controller (`src/controllers/UserController.php`)

```php
<?php

namespace App\Controllers;

use App\Models\User;
use App\Utils\Validation;

class UserController
{
    public static function list(): array
    {
        $pdo = \App\Config\Database::getConnection();
        $stmt = $pdo->query("SELECT id, email, name, created_at FROM users ORDER BY created_at DESC");
        return $stmt->fetchAll();
    }

    public static function create(array $data): array
    {
        $errors = Validation::validateRequired($data, ['email', 'password', 'name']);
        
        if (!empty($errors)) {
            return ['success' => false, 'errors' => $errors];
        }
        
        if (!Validation::email($data['email'])) {
            return ['success' => false, 'errors' => ['email' => 'Ogiltig e-postadress']];
        }
        
        if (User::findByEmail($data['email'])) {
            return ['success' => false, 'errors' => ['email' => 'E-postadressen finns redan']];
        }
        
        $user = User::create([
            'email' => Validation::sanitizeString($data['email']),
            'password' => $data['password'],
            'name' => Validation::sanitizeString($data['name'])
        ]);
        
        return ['success' => true, 'user' => [
            'id' => $user->id,
            'email' => $user->email,
            'name' => $user->name
        ]];
    }
}
```

### View (`src/views/users/list.php`)

```php
<?php
$users = \App\Controllers\UserController::list();
?>
<!DOCTYPE html>
<html lang="sv">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Användare</title>
    <link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
    <h1>Användare</h1>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>E-post</th>
                <th>Namn</th>
                <th>Skapad</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($users as $user): ?>
            <tr>
                <td><?= htmlspecialchars($user['id']) ?></td>
                <td><?= htmlspecialchars($user['email']) ?></td>
                <td><?= htmlspecialchars($user['name']) ?></td>
                <td><?= htmlspecialchars($user['created_at']) ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
</body>
</html>
```

---

## API Endpoints med JSON

### API Route (`public/api/users.php`)

```php
<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../vendor/autoload.php';

use App\Controllers\UserController;
use App\Middleware\CSRF;
use App\Utils\Validation;

$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            $users = UserController::list();
            echo json_encode(['success' => true, 'data' => $users], JSON_UNESCAPED_UNICODE);
            break;
            
        case 'POST':
            // Validera CSRF
            $token = $_POST['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
            if (!CSRF::validateToken($token)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Invalid CSRF token']);
                break;
            }
            
            // Hämta JSON body om det finns
            $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
            
            $result = UserController::create($input);
            if ($result['success']) {
                http_response_code(201);
                echo json_encode($result, JSON_UNESCAPED_UNICODE);
            } else {
                http_response_code(400);
                echo json_encode($result, JSON_UNESCAPED_UNICODE);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    error_log("API Error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $_ENV['APP_DEBUG'] === 'true' ? $e->getMessage() : 'Internal server error'
    ]);
}
```

---

## Autentisering utan ramverk

### Auth Middleware (`src/middleware/auth.php`)

```php
<?php

namespace App\Middleware;

use App\Models\User;

class Auth
{
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start([
                'cookie_httponly' => true,
                'cookie_secure' => isset($_SERVER['HTTPS']),
                'cookie_samesite' => 'Strict',
                'use_strict_mode' => true
            ]);
        }
    }

    public static function login(User $user): void
    {
        self::startSession();
        
        // Regenerera session ID för säkerhet
        session_regenerate_id(true);
        
        $_SESSION['user_id'] = $user->id;
        $_SESSION['user_email'] = $user->email;
        $_SESSION['logged_in'] = true;
        $_SESSION['login_time'] = time();
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        
        if (isset($_COOKIE[session_name()])) {
            setcookie(session_name(), '', time() - 3600, '/');
        }
        
        session_destroy();
    }

    public static function check(): bool
    {
        self::startSession();
        
        if (!isset($_SESSION['logged_in']) || !$_SESSION['logged_in']) {
            return false;
        }
        
        // Timeout efter 2 timmar
        if (isset($_SESSION['login_time']) && (time() - $_SESSION['login_time']) > 7200) {
            self::logout();
            return false;
        }
        
        return true;
    }

    public static function user(): ?User
    {
        if (!self::check()) {
            return null;
        }
        
        return User::findById($_SESSION['user_id'] ?? 0);
    }

    public static function requireAuth(): void
    {
        if (!self::check()) {
            http_response_code(401);
            if (strpos($_SERVER['REQUEST_URI'], '/api/') === 0) {
                header('Content-Type: application/json');
                echo json_encode(['error' => 'Unauthorized']);
            } else {
                header('Location: /login.php');
            }
            exit;
        }
    }
}
```

### Login endpoint (`public/api/login.php`)

```php
<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../vendor/autoload.php';

use App\Middleware\Auth;
use App\Middleware\CSRF;
use App\Models\User;
use App\Utils\Validation;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

$token = $input['csrf_token'] ?? '';
if (!CSRF::validateToken($token)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid CSRF token']);
    exit;
}

$email = $input['email'] ?? '';
$password = $input['password'] ?? '';

if (empty($email) || empty($password)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Email och lösenord krävs']);
    exit;
}

$user = User::findByEmail($email);
if (!$user || !$user->verifyPassword($password)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Ogiltiga inloggningsuppgifter']);
    exit;
}

Auth::login($user);
echo json_encode(['success' => true, 'user' => [
    'id' => $user->id,
    'email' => $user->email,
    'name' => $user->name
]]);
```

---

## File Uploads och Bildhantering

### Upload Handler (`src/utils/upload.php`)

```php
<?php

namespace App\Utils;

class Upload
{
    private const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    private const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    private const UPLOAD_DIR = __DIR__ . '/../../public/uploads/';

    public static function handleImage(array $file, string $subdir = ''): array
    {
        // Validera fil
        if ($file['error'] !== UPLOAD_ERR_OK) {
            return ['success' => false, 'error' => 'Upload error'];
        }
        
        if ($file['size'] > self::MAX_FILE_SIZE) {
            return ['success' => false, 'error' => 'Filen är för stor (max 5MB)'];
        }
        
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);
        
        if (!in_array($mimeType, self::ALLOWED_TYPES)) {
            return ['success' => false, 'error' => 'Ogiltig filtyp'];
        }
        
        // Generera säkert filnamn
        $extension = match($mimeType) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg'
        };
        
        $filename = bin2hex(random_bytes(16)) . '.' . $extension;
        $uploadPath = self::UPLOAD_DIR . $subdir;
        
        if (!is_dir($uploadPath)) {
            mkdir($uploadPath, 0755, true);
        }
        
        $fullPath = $uploadPath . $filename;
        
        if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
            return ['success' => false, 'error' => 'Kunde inte spara filen'];
        }
        
        // Skapa thumbnail (valfritt)
        self::createThumbnail($fullPath, $uploadPath . 'thumb_' . $filename, 200);
        
        return [
            'success' => true,
            'filename' => $filename,
            'path' => '/uploads/' . $subdir . $filename,
            'size' => $file['size']
        ];
    }

    private static function createThumbnail(string $source, string $dest, int $maxSize): void
    {
        $image = match(mime_content_type($source)) {
            'image/jpeg' => imagecreatefromjpeg($source),
            'image/png' => imagecreatefrompng($source),
            'image/webp' => imagecreatefromwebp($source),
            default => null
        };
        
        if (!$image) return;
        
        $width = imagesx($image);
        $height = imagesy($image);
        
        if ($width <= $maxSize && $height <= $maxSize) {
            copy($source, $dest);
            imagedestroy($image);
            return;
        }
        
        $ratio = min($maxSize / $width, $maxSize / $height);
        $newWidth = (int)($width * $ratio);
        $newHeight = (int)($height * $ratio);
        
        $thumbnail = imagecreatetruecolor($newWidth, $newHeight);
        imagecopyresampled($thumbnail, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
        
        $extension = pathinfo($dest, PATHINFO_EXTENSION);
        match($extension) {
            'jpg', 'jpeg' => imagejpeg($thumbnail, $dest, 85),
            'png' => imagepng($thumbnail, $dest, 8),
            'webp' => imagewebp($thumbnail, $dest, 85)
        };
        
        imagedestroy($image);
        imagedestroy($thumbnail);
    }
}
```

### Upload Endpoint (`public/api/upload.php`)

```php
<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../vendor/autoload.php';

use App\Middleware\Auth;
use App\Utils\Upload;

Auth::requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

if (!isset($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Ingen fil skickad']);
    exit;
}

$result = Upload::handleImage($_FILES['file'], 'images/');
echo json_encode($result, JSON_UNESCAPED_UNICODE);
```

### `.htaccess` för uploads (säkerhet)

```apache
# Förhindra körning av PHP i uploads
<Directory "/path/to/public/uploads">
    php_flag engine off
    Options -ExecCGI
    RemoveHandler .php .phtml .php3 .php4 .php5 .phps .cgi .exe .pl .asp .aspx .shtml .shtm .fcgi .fpl .jsp .htm .html .js
    AddType text/plain .php .phtml .php3 .php4 .php5 .phps .cgi .exe .pl .asp .aspx .shtml .shtm .fcgi .fpl .jsp .htm .html .js
</Directory>
```

---

## Caching-strategier

### Enkel File Cache (`src/utils/cache.php`)

```php
<?php

namespace App\Utils;

class Cache
{
    private const CACHE_DIR = __DIR__ . '/../../cache/';
    private const DEFAULT_TTL = 3600; // 1 timme

    public static function get(string $key): mixed
    {
        $file = self::CACHE_DIR . md5($key) . '.cache';
        
        if (!file_exists($file)) {
            return null;
        }
        
        $data = unserialize(file_get_contents($file));
        
        if ($data['expires'] < time()) {
            unlink($file);
            return null;
        }
        
        return $data['value'];
    }

    public static function set(string $key, mixed $value, int $ttl = self::DEFAULT_TTL): void
    {
        if (!is_dir(self::CACHE_DIR)) {
            mkdir(self::CACHE_DIR, 0755, true);
        }
        
        $file = self::CACHE_DIR . md5($key) . '.cache';
        $data = [
            'value' => $value,
            'expires' => time() + $ttl
        ];
        
        file_put_contents($file, serialize($data), LOCK_EX);
    }

    public static function delete(string $key): void
    {
        $file = self::CACHE_DIR . md5($key) . '.cache';
        if (file_exists($file)) {
            unlink($file);
        }
    }

    public static function clear(): void
    {
        $files = glob(self::CACHE_DIR . '*.cache');
        foreach ($files as $file) {
            unlink($file);
        }
    }
}
```

### Användning

```php
// Cacha databasresultat
$cacheKey = 'users_list';
$users = \App\Utils\Cache::get($cacheKey);

if ($users === null) {
    $users = UserController::list();
    \App\Utils\Cache::set($cacheKey, $users, 1800); // 30 minuter
}

// Rensa cache vid uppdatering
UserController::create($data);
\App\Utils\Cache::delete('users_list');
```

### HTTP Caching Headers

```php
// För statiska resurser (lägg i .htaccess eller PHP)
header('Cache-Control: public, max-age=31536000'); // 1 år
header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 31536000) . ' GMT');

// För dynamiskt innehåll
header('Cache-Control: no-cache, must-revalidate');
header('Pragma: no-cache');
```

---

## Deployment

### Via FTP/SFTP

1. **Lokalt:**
   ```bash
   # Bygg projektet
   composer install --no-dev --optimize-autoloader
   
   # Skapa deployment-paket
   tar -czf deploy.tar.gz \
     --exclude='.git' \
     --exclude='.env' \
     --exclude='node_modules' \
     --exclude='cache/*' \
     --exclude='*.log' \
     .
   ```

2. **Upload via FTP:**
   ```bash
   # Använd FileZilla, WinSCP eller liknande
   # Upload till webhosts document root (t.ex. public_html/)
   ```

3. **På servern:**
   ```bash
   # Extrahera
   tar -xzf deploy.tar.gz
   
   # Sätt rättigheter
   chmod 755 public/
   chmod 777 cache/ uploads/
   
   # Skapa .env från .env.example
   cp .env.example .env
   # Redigera .env med rätt databasuppgifter
   ```

### Via Git

1. **På webhosten (t.ex. cPanel Git Version Control):**
   ```bash
   git clone https://github.com/user/repo.git
   cd repo
   composer install --no-dev --optimize-autoloader
   ```

2. **Automatisk deployment med webhook:**
   ```php
   // public/deploy.php (skyddad med API key)
   <?php
   $secret = $_ENV['DEPLOY_SECRET'] ?? '';
   $header = $_SERVER['HTTP_X_GITHUB_SECRET'] ?? '';
   
   if (!hash_equals($secret, $header)) {
       http_response_code(403);
       exit;
   }
   
   $output = [];
   exec('cd /path/to/repo && git pull && composer install --no-dev 2>&1', $output);
   echo json_encode(['output' => $output]);
   ```

### Apache `.htaccess` (URL Rewriting)

```apache
# Aktivera rewrite engine
RewriteEngine On

# Redirect till HTTPS (valfritt)
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Skydda .env och känsliga filer
<FilesMatch "^(\.env|composer\.(json|lock)|\.git)">
    Order allow,deny
    Deny from all
</FilesMatch>

# Routing till index.php
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php [QSA,L]

# Gzip compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
</IfModule>
```

---

## Checklista för Production

- [ ] `.env` är korrekt konfigurerad
- [ ] `APP_DEBUG=false` i production
- [ ] Error logging är aktiverat
- [ ] HTTPS är aktiverat
- [ ] CSRF protection på alla formulär
- [ ] Prepared statements överallt (ingen direkt SQL)
- [ ] Input validation på alla inputs
- [ ] File uploads är begränsade (storlek, typ)
- [ ] `.htaccess` skyddar känsliga filer
- [ ] Cache är konfigurerad
- [ ] Database backups är schemalagda
- [ ] Security headers är satta
- [ ] Session security är korrekt konfigurerad

---

## Resurser

- [PHP 8.3 Documentation](https://www.php.net/manual/en/)
- [MariaDB Documentation](https://mariadb.com/kb/en/documentation/)
- [OWASP PHP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/PHP_Configuration_Cheat_Sheet.html)
- [PHP The Right Way](https://phptherightway.com/)
