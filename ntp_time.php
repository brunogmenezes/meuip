<?php
/**
 * MeuIP BGP Dashboard - NTP.br Time Fetcher
 * Connects to public NTP.br servers via UDP port 123 to fetch atomic time.
 */

// Enable CORS for frontend API calls
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Content-Type: application/json; charset=utf-8');

// Disable caching for live queries
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');

/**
 * Queries a standard NTP server via UDP socket.
 * Returns the atomic timestamp and RTT.
 */
function query_ntp_server($host) {
    // NTP packet header: LI=0 (no warning), VN=4 (v4), Mode=3 (client) -> 0x23
    $data = "\x23" . str_repeat("\0", 47);
    
    $socket = @fsockopen("udp://$host", 123, $err_no, $err_str, 1.5);
    if (!$socket) {
        return null;
    }
    
    stream_set_timeout($socket, 1.5);
    $t1 = microtime(true);
    
    if (!@fwrite($socket, $data)) {
        fclose($socket);
        return null;
    }
    
    $response = @fread($socket, 48);
    $t4 = microtime(true);
    fclose($socket);
    
    if (strlen($response) < 48) {
        return null;
    }
    
    // Extract transmit timestamp seconds (offset 40)
    $unpack = unpack("N", substr($response, 40, 4));
    $sec = $unpack[1];
    
    // Extract fractional seconds (offset 44)
    $unpack_frac = unpack("N", substr($response, 44, 4));
    $frac = $unpack_frac[1] / 4294967296.0;
    
    // Convert NTP epoch (1900) to Unix epoch (1970)
    $unix_time = $sec - 2208988800;
    $rtt = $t4 - $t1;
    
    return [
        'ntp_time' => $unix_time + $frac,
        'rtt' => $rtt
    ];
}

// NTP.br Servers Pool
$servers = ['a.ntp.br', 'b.ntp.br', 'c.ntp.br', 'gps.ntp.br', 'pool.ntp.br'];
$result = null;

foreach ($servers as $srv) {
    $res = query_ntp_server($srv);
    if ($res !== null) {
        $result = $res;
        $result['server'] = $srv;
        break;
    }
}

if ($result === null) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Nao foi possivel conectar aos servidores do NTP.br.'
    ]);
    exit;
}

echo json_encode([
    'status' => 'success',
    'ntp_time' => $result['ntp_time'],
    'server_time' => microtime(true),
    'rtt' => $result['rtt'],
    'ntp_server' => $result['server']
]);
