<?php
/**
 * MeuIP BGP Dashboard - RBL Blacklist Checker
 * Performs DNSBL (Real-time Blackhole List) checks for IPv4 and IPv6 addresses.
 */

// Enable CORS for frontend API calls
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Content-Type: application/json; charset=utf-8');

// Disable caching for live queries
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

// Get IP from query parameter
$ip = isset($_GET['ip']) ? trim($_GET['ip']) : '';

if (empty($ip)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Nenhum endereço IP fornecido.'
    ]);
    exit;
}

// Validate IP address
$is_ipv4 = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4);
$is_ipv6 = filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6);

if (!$is_ipv4 && !$is_ipv6) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Endereço IP inválido fornecido.'
    ]);
    exit;
}

// Define RBL servers to check
$rbls = [
    'Spamhaus Zen' => [
        'host' => 'zen.spamhaus.org',
        'ipv6' => true,
        'description' => 'Combinação das listas SBL, XBL e PBL do Spamhaus.',
        'removal_url' => 'https://www.spamhaus.org/lookup/'
    ],
    'Spamcop' => [
        'host' => 'bl.spamcop.net',
        'ipv6' => false,
        'description' => 'Lista baseada em denúncias de spam recebidas por spamtraps.',
        'removal_url' => 'https://www.spamcop.net/bl.shtml'
    ],
    'SORBS DUHL' => [
        'host' => 'dnsbl.sorbs.net',
        'ipv6' => false,
        'description' => 'Lista IPs dinâmicos e de conexões residenciais.',
        'removal_url' => 'http://www.sorbs.net/lookup.shtml'
    ],
    'UCEPROTECT Level 1' => [
        'host' => 'dnsbl-1.uceprotect.net',
        'ipv6' => false,
        'description' => 'Lista servidores de e-mail abusivos e abusadores individuais.',
        'removal_url' => 'http://www.uceprotect.net/en/rblcheck.php'
    ],
    'SPFBL' => [
        'host' => 'dnsbl.spfbl.net',
        'ipv6' => true,
        'description' => 'DNSBL brasileira focada no combate ao spam local e internacional.',
        'removal_url' => 'https://spfbl.net/delist/'
    ]
];

// Helper functions for reversing IPs for DNSBL format
function reverse_ipv4($ipv4) {
    return implode('.', array_reverse(explode('.', $ipv4)));
}

function reverse_ipv6($ipv6) {
    $binary = inet_pton($ipv6);
    if ($binary === false) {
        return '';
    }
    $hex = unpack("H*hex", $binary);
    $hex_string = $hex['hex'];
    return implode('.', array_reverse(str_split($hex_string)));
}

// Prepare query prefix
$query_prefix = '';
if ($is_ipv4) {
    $query_prefix = reverse_ipv4($ip);
} elseif ($is_ipv6) {
    $query_prefix = reverse_ipv6($ip);
}

$results = [];
$total_listed = 0;
$total_checked = 0;

foreach ($rbls as $name => $info) {
    $host = $info['host'];
    $supports_ipv6 = $info['ipv6'];
    
    // Check if RBL supports the current IP protocol
    if ($is_ipv6 && !$supports_ipv6) {
        $results[$name] = [
            'listed' => false,
            'details' => 'Não suporta IPv6',
            'code' => null,
            'blocked' => false,
            'status' => 'unsupported',
            'description' => $info['description'],
            'removal_url' => $info['removal_url']
        ];
        continue;
    }
    
    $query_host = $query_prefix . '.' . $host;
    $total_checked++;
    
    // Perform DNS lookup
    $records = @dns_get_record($query_host, DNS_A);
    
    if (!empty($records) && isset($records[0]['ip'])) {
        $resolved_ip = $records[0]['ip'];
        
        // Spamhaus Block codes handling
        // 127.255.255.252 -> Blocked due to public DNS (Google, Cloudflare, OpenDNS)
        // 127.255.255.254 -> Rate-limited / Query source blocked
        // 127.255.255.255 -> Blocked query source
        if ($name === 'Spamhaus Zen' && strpos($resolved_ip, '127.255.255.') === 0) {
            $results[$name] = [
                'listed' => false,
                'details' => 'Consulta Recusada (DNS Público não autorizado)',
                'code' => $resolved_ip,
                'blocked' => true,
                'status' => 'blocked',
                'description' => $info['description'],
                'removal_url' => $info['removal_url']
            ];
            continue;
        }
        
        // If SPFBL returns 127.0.0.1, it's typically a lookup error or rate limit
        if ($name === 'SPFBL' && $resolved_ip === '127.0.0.1') {
            $results[$name] = [
                'listed' => false,
                'details' => 'Consulta bloqueada / Limite excedido',
                'code' => $resolved_ip,
                'blocked' => true,
                'status' => 'blocked',
                'description' => $info['description'],
                'removal_url' => $info['removal_url']
            ];
            continue;
        }
        
        $details = 'LISTADO (' . $resolved_ip . ')';
        if ($name === 'SPFBL') {
            if ($resolved_ip === '127.0.0.2') {
                $details = 'Listado: Spam ativo / Reclamações';
            } elseif ($resolved_ip === '127.0.0.3') {
                $details = 'Listado: Suspeita de spam';
            } elseif ($resolved_ip === '127.0.0.4') {
                $details = 'Política: IP sem servidor de e-mail (MTA) válido';
            } elseif ($resolved_ip === '127.0.0.5') {
                $details = 'Política: Reverso genérico ou ausente';
            } elseif ($resolved_ip === '127.0.0.6') {
                $details = 'Política: IP Dinâmico';
            }
        } elseif ($name === 'Spamhaus Zen') {
            if ($resolved_ip === '127.0.0.2') {
                $details = 'Listado: SBL (Spam ativo)';
            } elseif ($resolved_ip === '127.0.0.3') {
                $details = 'Listado: CSS (Má reputação)';
            } elseif (in_array($resolved_ip, ['127.0.0.4', '127.0.0.5', '127.0.0.6', '127.0.0.7'])) {
                $details = 'Listado: XBL (Máquina infectada / Exploit)';
            } elseif (in_array($resolved_ip, ['127.0.0.10', '127.0.0.11'])) {
                $details = 'Política: PBL (IP Residencial ou Dinâmico)';
            }
        }

        $total_listed++;
        $results[$name] = [
            'listed' => true,
            'details' => $details,
            'code' => $resolved_ip,
            'blocked' => false,
            'status' => 'listed',
            'description' => $info['description'],
            'removal_url' => $info['removal_url']
        ];
    } else {
        $results[$name] = [
            'listed' => false,
            'details' => 'Limpo',
            'code' => null,
            'blocked' => false,
            'status' => 'clean',
            'description' => $info['description'],
            'removal_url' => $info['removal_url']
        ];
    }
}

// Return output
echo json_encode([
    'status' => 'success',
    'ip' => $ip,
    'ip_type' => $is_ipv4 ? 'IPv4' : 'IPv6',
    'total_listed' => $total_listed,
    'total_checked' => $total_checked,
    'blacklists' => $results
]);
