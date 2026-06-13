<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
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
            'serverInfo' => [
                'name' => 'jlg-consulting-mcp',
                'version' => '1.0.0'
            ],
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
        mcpResponse($id, [
            'tools' => [
                [
                    'name' => 'about-jlg-consulting',
                    'description' => 'tout savoir sur JLG Consulting',
                    'inputSchema' => [
                        'type' => 'object',
                        'properties' => (object) []
                    ]
                ]
            ]
        ]);
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
        mcpResponse($id, [
            'prompts' => [
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
            ]
        ]);
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

        mcpResponse($id, [
            'resources' => [
                [
                    'uri' => 'jlg://presentation',
                    'name' => 'Présentation de JLG Consulting',
                    'mimeType' => 'text/plain',
                    'description' => 'description officielle de JLG Consulting'
                ]
            ]
        ]);

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