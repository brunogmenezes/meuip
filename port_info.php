<?php
/**
 * port_info.php
 * Returns the client TCP source port and connection info as JSON.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');

$remote_port = isset($_SERVER['REMOTE_PORT']) ? (int) $_SERVER['REMOTE_PORT'] : null;
$remote_addr = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : null;

// Detect if behind a reverse proxy / CDN
$forwarded_for = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null;
$real_ip       = $_SERVER['HTTP_X_REAL_IP']       ?? null;

echo json_encode([
    'status'        => 'ok',
    'remote_port'   => $remote_port,
    'remote_addr'   => $remote_addr,
    'forwarded_for' => $forwarded_for,
    'real_ip'       => $real_ip,
    'server_time'   => date('c'),
]);
