<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Authorization');

$httpMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($httpMethod === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($httpMethod === 'GET' || $httpMethod === 'HEAD') {
    header('Content-Type: text/html; charset=utf-8');
    echo renderPage();
    exit;
}

if ($httpMethod !== 'POST') {
    header('Allow: GET, HEAD, POST, OPTIONS');
    http_response_code(405);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

$body = file_get_contents('php://input');
$request = json_decode($body, true);

if (!is_array($request)) {
    http_response_code(400);
    echo json_encode(
        [
            'jsonrpc' => '2.0',
            'id' => null,
            'error' => [
                'code' => -32700,
                'message' => 'Invalid JSON'
            ]
        ],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

$id = $request['id'] ?? null;
$method = $request['method'] ?? null;
$params = $request['params'] ?? [];

function mcpResponse($id, $result): void
{
    echo json_encode(
        [
            'jsonrpc' => '2.0',
            'id' => $id,
            'result' => $result
        ],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

function mcpError($id, int $code, string $message): void
{
    echo json_encode(
        [
            'jsonrpc' => '2.0',
            'id' => $id,
            'error' => [
                'code' => $code,
                'message' => $message
            ]
        ],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

switch ($method) {

    case 'initialize':
        mcpResponse($id, [
            'protocolVersion' => '2024-11-05',
            'serverInfo' => mcpServerInfo(),
            'capabilities' => [
                'tools' => (object) [],
                'prompts' => (object) [],
                'resources' => (object) []
            ]
        ]);
        break;


    /*
    |--------------------------------------------------------------------------
    | TOOLS
    |--------------------------------------------------------------------------
    */

    case 'tools/list':
        mcpResponse($id, ['tools' => mcpTools()]);
        break;

    case 'tools/call':

        $toolName = $params['name'] ?? null;

        if ($toolName !== 'about-jlg-consulting') {
            mcpError($id, -32601, 'Unknown tool');
        }

        $text = "JLG Consulting, c'est un peu le dojo où les bugs entrent nerveux et ressortent repentis.

On y pratique l'art subtil de transformer :
- du café en architecture logicielle,
- des idées floues en solutions nettes,
- et des 'ça marchait hier' en explications très pédagogiques.

Chez JLG Consulting, JavaScript et TypeScript sont traités avec respect, Node.js avec méthode, et l'IA avec curiosité sérieuse... mais jamais triste.

La légende raconte que certains problèmes techniques se résolvent rien qu'en apprenant que Jean-Louis va les regarder.

Devise officieuse :
'Un bon bug est un bug qu'on peut raconter en formation.'

Plus d'infos :
https://www.jlg-consulting.com";

        mcpResponse($id, [
            'content' => [
                [
                    'type' => 'text',
                    'text' => $text
                ]
            ]
        ]);
        break;


    /*
    |--------------------------------------------------------------------------
    | PROMPTS
    |--------------------------------------------------------------------------
    */

    case 'prompts/list':
        mcpResponse($id, ['prompts' => mcpPrompts()]);
        break;

    case 'prompts/get':

        $name = $params['name'] ?? null;

        if ($name !== 'write-jlg-story') {
            mcpError($id, -32602, 'Invalid prompt name');
        }

        $theme = $params['arguments']['theme'] ?? 'un bug mystérieux';

        mcpResponse($id, [
            'description' => 'Petite histoire humoristique sur JLG Consulting',
            'messages' => [
                [
                    'role' => 'user',
                    'content' => [
                        'type' => 'text',
                        'text' => "Tu es un formateur en informatique travaillant chez JLG Consulting.

Écris une courte histoire drôle à propos de JLG Consulting autour du thème suivant : {$theme}."
                    ]
                ]
            ]
        ]);

        break;


    /*
    |--------------------------------------------------------------------------
    | RESOURCES
    |--------------------------------------------------------------------------
    */

    case 'resources/list':

        mcpResponse($id, ['resources' => mcpResources()]);

        break;


    case 'resources/read':

        $uri = $params['uri'] ?? null;

        if ($uri !== 'jlg://presentation') {
            mcpError($id, -32601, 'Unknown resource');
        }

        $text = "JLG Consulting est une société de conseil et de formation en informatique fondée par Jean-Louis Guénégo.

Ses activités principales sont :

- la formation professionnelle (JavaScript, TypeScript, Node.js, IA)
- l'accompagnement technique d'équipes de développement
- la vulgarisation pédagogique de sujets complexes

La philosophie de JLG Consulting est simple :
comprendre profondément les technologies pour mieux les expliquer.

Et puis surtout : travailler dans la joie et la bonne humeur, parce que coder, c'est déjà assez sérieux comme ça.

Site web :
https://www.jlg-consulting.com";

        mcpResponse($id, [
            'contents' => [
                [
                    'uri' => 'jlg://presentation',
                    'mimeType' => 'text/plain',
                    'text' => $text
                ]
            ]
        ]);

        break;


    case 'notifications/initialized':
    case 'exit':
        // Notifications sans réponse attendue
        http_response_code(204);
        exit;

    case 'shutdown':
        mcpResponse($id, (object) []);
        break;

    default:
        mcpError($id, -32601, 'Method not supported');
}

function mcpServerInfo(): array
{
    return [
        'name' => 'jlg-consulting-mcp',
        'version' => '1.0.0'
    ];
}

function mcpTools(): array
{
    return [
        [
            'name' => 'about-jlg-consulting',
            'description' => 'tout savoir sur JLG Consulting',
            'inputSchema' => [
                'type' => 'object',
                'properties' => (object) []
            ]
        ]
    ];
}

function mcpPrompts(): array
{
    return [
        [
            'name' => 'write-jlg-story',
            'description' => 'écrire une petite histoire humoristique sur JLG Consulting',
            'arguments' => [
                [
                    'name' => 'theme',
                    'description' => 'thème de l\'histoire',
                    'required' => false
                ]
            ]
        ]
    ];
}

function mcpResources(): array
{
    return [
        [
            'uri' => 'jlg://presentation',
            'name' => 'Présentation de JLG Consulting',
            'mimeType' => 'text/plain',
            'description' => 'description officielle de JLG Consulting'
        ]
    ];
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function renderSection(string $title, string $cards): string
{
    $content = $cards !== '' ? "<div class=\"grid\">{$cards}</div>" : '<p class="muted">Aucun élément.</p>';

    return "<section><h2>{$title}</h2>{$content}</section>";
}

function renderPage(): string
{
    $server = mcpServerInfo();
    $name = h($server['name']);
    $version = h($server['version']);

    $toolCards = '';
    foreach (mcpTools() as $tool) {
        $toolCards .= sprintf(
            '<article class="card"><span class="tag">tool</span><h3>%s</h3><p>%s</p></article>',
            h($tool['name']),
            h($tool['description'])
        );
    }

    $promptCards = '';
    foreach (mcpPrompts() as $prompt) {
        $args = '';
        foreach ($prompt['arguments'] as $arg) {
            $args .= sprintf(
                '<li><code>%s</code> %s <span class="muted">(%s)</span></li>',
                h($arg['name']),
                h($arg['description']),
                $arg['required'] ? 'requis' : 'optionnel'
            );
        }
        $promptCards .= sprintf(
            '<article class="card"><span class="tag">prompt</span><h3>%s</h3><p>%s</p><ul class="args">%s</ul></article>',
            h($prompt['name']),
            h($prompt['description']),
            $args
        );
    }

    $resourceCards = '';
    foreach (mcpResources() as $resource) {
        $resourceCards .= sprintf(
            '<article class="card"><span class="tag">resource</span><h3>%s</h3><p>%s</p><dl><dt>URI</dt><dd><code>%s</code></dd><dt>Type</dt><dd><code>%s</code></dd></dl></article>',
            h($resource['name']),
            h($resource['description']),
            h($resource['uri']),
            h($resource['mimeType'])
        );
    }

    $tools = renderSection('Outils', $toolCards);
    $prompts = renderSection('Prompts', $promptCards);
    $resources = renderSection('Ressources', $resourceCards);

    return <<<HTML
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600&family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@500;700&display=swap" rel="stylesheet">
<title>{$name} · Serveur MCP</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #f3f6fb;
  --star: rgba(11, 127, 171, 0.35);
  --font-display: "Orbitron", sans-serif;
  --font-body: "Exo 2", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", Consolas, monospace;
  --text: #0b1430;
  --muted: #4a5878;
  --accent: #d9480f;
  --accent-2: #0b7fab;
  --card: rgba(255, 255, 255, 0.65);
  --border: rgba(11, 127, 171, 0.3);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #05070d;
    --star: rgba(255, 255, 255, 0.75);
    --text: #e6f1ff;
    --muted: #7d8ba6;
    --accent: #ff7a3d;
    --accent-2: #5ce1ff;
    --card: rgba(255, 255, 255, 0.04);
    --border: rgba(92, 225, 255, 0.25);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--font-body);
  line-height: 1.6;
  color: var(--text);
  background-color: var(--bg);
  background-image:
    radial-gradient(1px 1px at 20px 30px, var(--star), transparent),
    radial-gradient(1px 1px at 120px 80px, var(--star), transparent),
    radial-gradient(1.5px 1.5px at 200px 150px, var(--star), transparent),
    radial-gradient(1px 1px at 70px 200px, var(--star), transparent),
    radial-gradient(1px 1px at 260px 230px, var(--star), transparent);
  background-size: 300px 300px;
}
a { color: var(--accent); }
code { font-family: var(--font-mono); color: var(--accent); }
.muted { color: var(--muted); }
.hero { text-align: center; padding: 1.5rem 1rem 0.5rem; }
.rocket { display: block; margin: 0 auto 0.25rem; color: var(--accent); }
.hero h1 {
  margin: 0.25rem 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 3.5vw, 2.6rem);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent);
}
.badge {
  display: inline-block;
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--accent);
}
.badge::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 0.5rem;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 2s infinite;
}
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
main { flex: 1; width: 100%; max-width: 1200px; margin: 0 auto; padding: 0.75rem 1.25rem; }
.lead { max-width: 60ch; margin: 0 auto; text-align: center; color: var(--muted); }
.sections { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 1rem; }
section { min-width: 0; display: flex; flex-direction: column; }
h2 {
  margin: 0 0 1rem;
  font-family: var(--font-display);
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: var(--accent);
}
.grid { display: grid; gap: 0.75rem; flex: 1; }
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1rem;
  transition: border-color 0.2s;
}
.card:hover { border-color: var(--accent); }
.card h3 { margin: 0.6rem 0 0.4rem; font-family: var(--font-display); font-size: 1rem; font-weight: 500; letter-spacing: 0.04em; }
.card p { margin: 0; color: var(--muted); }
.tag {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--accent-2);
}
.args { margin: 0.8rem 0 0; padding-left: 1.1rem; color: var(--muted); font-size: 0.9rem; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 0.75rem; margin: 0.8rem 0 0; font-size: 0.9rem; }
dt { color: var(--muted); }
dd { margin: 0; }
footer { text-align: center; padding: 0.75rem; color: var(--muted); font-size: 0.85rem; }
@media (prefers-reduced-motion: reduce) {
  *, *::before { animation: none !important; transition: none !important; }
}
</style>
</head>
<body>
<header class="hero">
  <svg class="rocket" width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M12 2c2.8 2.3 4 5.6 4 9.5V16H8v-4.5C8 7.6 9.2 4.3 12 2z"/>
    <path fill="currentColor" d="M8 12l-3 3v3l3-1.5zM16 12l3 3v3l-3-1.5z"/>
    <path fill="currentColor" fill-opacity="0.5" d="M10 17h4l-2 5z"/>
  </svg>
  <span class="badge">MCP · JSON-RPC</span>
  <h1>{$name}</h1>
  <p class="muted">Serveur MCP v{$version}</p>
</header>
<main>
  <p class="lead">Point d'accès MCP : il répond aux requêtes JSON-RPC envoyées en POST par un client compatible.</p>
  <div class="sections">
  {$tools}
  {$prompts}
  {$resources}
  </div>
</main>
<footer><a href="https://www.jlg-consulting.com">JLG Consulting</a></footer>
</body>
</html>
HTML;
}
