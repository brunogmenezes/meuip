/**
 * MeuIP BGP Dashboard - Main Application Script
 * Integrates client-side geolocation, RIPE BGP & RPKI data, Leaflet mapping,
 * and calls the local PHP blacklist checker.
 */

// Application State
const state = {
    ipv4: null,
    ipv6: null,
    activeIp: null,
    activeIpType: null, // 'IPv4' or 'IPv6'
    map: null,
    mapMarker: null,
    isFirstLoad: true,
    bgpData: null,
    geolocData: null
};

// DOM Elements
const elements = {
    badgeIpv4: document.getElementById('badge-ipv4'),
    badgeIpv6: document.getElementById('badge-ipv6'),
    btnRefresh: document.getElementById('btn-refresh'),
    
    // IP Cards
    valIpv4: document.getElementById('ip-val-ipv4'),
    valIpv6: document.getElementById('ip-val-ipv6'),
    ispIpv4: document.getElementById('isp-ipv4'),
    ispIpv6: document.getElementById('isp-ipv6'),
    pulseIpv4: document.getElementById('pulse-ipv4'),
    pulseIpv6: document.getElementById('pulse-ipv6'),
    indicatorTextIpv4: document.getElementById('indicator-text-ipv4'),
    indicatorTextIpv6: document.getElementById('indicator-text-ipv6'),
    btnCopyIpv4: document.getElementById('btn-copy-ipv4'),
    btnCopyIpv6: document.getElementById('btn-copy-ipv6'),
    
    // Network Card
    netIsp: document.getElementById('net-isp'),
    netAsn: document.getElementById('asn-value'),
    netPrefix: document.getElementById('net-prefix'),
    netLocation: document.getElementById('net-location'),
    netDns: document.getElementById('net-dns'),
    
    // BGP & RPKI Card
    bgpSpecificPrefix: document.getElementById('bgp-specific-prefix'),
    rpkiBadge: document.getElementById('rpki-badge'),
    bgpVisibilityBar: document.getElementById('bgp-visibility-bar'),
    bgpVisibilityText: document.getElementById('bgp-visibility-text'),
    bgpVisibilityPercent: document.getElementById('bgp-visibility-percent'),
    
    // Blacklist Card
    blacklistIpSelect: document.getElementById('blacklist-ip-select'),
    blacklistOverallBadge: document.getElementById('blacklist-overall-badge'),
    blacklistItemsContainer: document.getElementById('blacklist-items-container'),
    
    // Map Card
    mapCoordVal: document.getElementById('map-coord-val'),
    mapTimezoneVal: document.getElementById('map-timezone-val'),
    ntpClock: document.getElementById('ntp-clock'),
    ntpStatusBadge: document.getElementById('ntp-status-badge'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // Setup Event Listeners
    setupEventListeners();
    
    // Start IP Detection
    detectIPs();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh Button
    elements.btnRefresh.addEventListener('click', () => {
        detectIPs();
    });
    
    // Copy Buttons
    elements.btnCopyIpv4.addEventListener('click', () => {
        copyToClipboard(elements.valIpv4.textContent, 'IPv4 copiado!');
    });
    elements.btnCopyIpv6.addEventListener('click', () => {
        copyToClipboard(elements.valIpv6.textContent, 'IPv6 copiado!');
    });
    
    // Blacklist IP Selector
    elements.blacklistIpSelect.addEventListener('change', (e) => {
        const selectedType = e.target.value;
        const targetIp = selectedType === 'ipv4' ? state.ipv4 : state.ipv6;
        if (targetIp) {
            runBlacklistCheck(targetIp, selectedType.toUpperCase());
        }
    });

    // Handle map container resizing on viewport size change
    window.addEventListener('resize', () => {
        if (state.map && typeof state.map.invalidateSize === 'function') {
            state.map.invalidateSize();
        }
    });
}

// Copy to Clipboard Utility
function copyToClipboard(text, successMessage) {
    if (!text || text === '...' || text === 'Não disponível') return;
    
    navigator.clipboard.writeText(text).then(() => {
        showToast(successMessage);
    }).catch(err => {
        console.error('Falha ao copiar:', err);
    });
}

// Toast Notification Controller
function showToast(message) {
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
        elements.toast.classList.remove('show');
    }, 2500);
}

// Helper to add skeleton classes
function setSkeletons(active) {
    const targets = [
        elements.netIsp, elements.netAsn, elements.netPrefix, elements.netLocation,
        elements.netDns,
        elements.bgpSpecificPrefix, elements.rpkiBadge,
        elements.mapCoordVal, elements.mapTimezoneVal
    ];
    
    targets.forEach(el => {
        if (active) {
            el.classList.add('skeleton');
            if (el.tagName !== 'SPAN') {
                el.classList.add('skeleton-text');
            } else if (el.id === 'rpki-badge' || el.id === 'asn-value') {
                el.classList.add('skeleton-badge');
            }
        } else {
            el.classList.remove('skeleton', 'skeleton-text', 'skeleton-badge');
        }
    });
}

// Helper to fetch IPv4 with fallbacks (ipify -> ident.me -> icanhazip)
async function fetchIpv4WithFallback() {
    try {
        const res = await fetch('https://api4.ipify.org?format=json');
        if (res.ok) {
            const data = await res.json();
            if (data.ip) return data.ip;
        }
    } catch (e) {
        console.warn('IPv4 ipify falhou, tentando ident.me...', e);
    }
    
    try {
        const res = await fetch('https://v4.ident.me/.json');
        if (res.ok) {
            const data = await res.json();
            if (data.address) return data.address;
        }
    } catch (e) {
        console.warn('IPv4 ident.me falhou, tentando icanhazip...', e);
    }
    
    try {
        const res = await fetch('https://ipv4.icanhazip.com');
        if (res.ok) {
            const text = await res.text();
            if (text) return text.trim();
        }
    } catch (e) {
        console.error('IPv4 falhou em todas as tentativas:', e);
    }
    
    return null;
}

// Helper to fetch IPv6 with fallbacks (ipify -> ident.me -> icanhazip)
async function fetchIpv6WithFallback() {
    try {
        const res = await fetch('https://api6.ipify.org?format=json');
        if (res.ok) {
            const data = await res.json();
            if (data.ip) return data.ip;
        }
    } catch (e) {
        console.warn('IPv6 ipify falhou, tentando ident.me...', e);
    }
    
    try {
        const res = await fetch('https://v6.ident.me/.json');
        if (res.ok) {
            const data = await res.json();
            if (data.address) return data.address;
        }
    } catch (e) {
        console.warn('IPv6 ident.me falhou, tentando icanhazip...', e);
    }
    
    try {
        const res = await fetch('https://ipv6.icanhazip.com');
        if (res.ok) {
            const text = await res.text();
            if (text) return text.trim();
        }
    } catch (e) {
        console.error('IPv6 falhou em todas as tentativas:', e);
    }
    
    return null;
}

// Helper to fetch Geolocation with fallbacks (ipwho.is -> RIPE Geoloc -> ipapi.co)
async function fetchGeolocWithFallback(ip) {
    try {
        const res = await fetch(`https://ipwho.is/${ip}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
                return {
                    success: true,
                    provider: 'ipwho.is',
                    city: data.city,
                    region: data.region,
                    country: data.country,
                    country_code: data.country_code,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    timezone: data.timezone?.id,
                    timezone_offset: data.timezone?.utc,
                    flag: { img: data.flag?.img || `https://flagcdn.com/w20/${data.country_code.toLowerCase()}.png` },
                    connection: data.connection
                };
            }
        }
    } catch (e) {
        console.warn('Geolocalização via ipwho.is falhou, tentando RIPE...', e);
    }
    
    try {
        const res = await fetch(`https://stat.ripe.net/data/geoloc/data.json?resource=${ip}`);
        if (res.ok) {
            const rData = await res.json();
            if (rData.status === 'ok' && rData.data && rData.data.located_resources && rData.data.located_resources.length > 0) {
                const locRes = rData.data.located_resources[0];
                if (locRes.locations && locRes.locations.length > 0) {
                    const loc = locRes.locations[0];
                    const country = loc.country || 'Desconhecido';
                    return {
                        success: true,
                        provider: 'RIPE NCC',
                        city: loc.city || 'Desconhecida',
                        region: '',
                        country: country,
                        country_code: country,
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        timezone: 'UTC',
                        timezone_offset: '+00:00',
                        flag: { img: `https://flagcdn.com/w20/${country.toLowerCase()}.png` },
                        connection: null
                    };
                }
            }
        }
    } catch (e) {
        console.warn('Geolocalização via RIPE falhou, tentando ipapi.co...', e);
    }
    
    try {
        const res = await fetch(`https://ipapi.co/${ip}/json/`);
        if (res.ok) {
            const data = await res.json();
            if (data && !data.error) {
                return {
                    success: true,
                    provider: 'ipapi.co',
                    city: data.city,
                    region: data.region,
                    country: data.country_name,
                    country_code: data.country_code,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    timezone: data.timezone,
                    timezone_offset: data.utc_offset,
                    flag: { img: `https://flagcdn.com/w20/${data.country_code.toLowerCase()}.png` },
                    connection: {
                        asn: data.asn ? String(data.asn).replace('AS', '') : null,
                        org: data.org,
                        isp: data.org
                    }
                };
            }
        }
    } catch (e) {
        console.error('Geolocalização falhou em todas as APIs:', e);
    }
    
    return { success: false, message: 'Localização indisponível' };
}

// Fetch Client DNS Resolver using edns.ip-api.com
async function detectDnsResolver() {
    elements.netDns.textContent = 'Buscando...';
    
    try {
        const res = await fetch('https://edns.ip-api.com/json');
        if (res.ok) {
            const data = await res.json();
            if (data && data.dns) {
                const dnsIp = data.dns.ip;
                const dnsGeo = data.dns.geo;
                elements.netDns.innerHTML = `<span class="code-font text-highlight">${dnsIp}</span> <small style="color:var(--text-muted); display:block; margin-top:2px;">(${dnsGeo})</small>`;
            } else {
                elements.netDns.textContent = 'Não detectado';
            }
        } else {
            elements.netDns.textContent = 'Não detectado (Erro API)';
        }
    } catch (e) {
        console.warn('Erro ao obter DNS Resolver:', e);
        elements.netDns.textContent = 'Erro ao detectar';
    }
}

let ntpTimeOffset = 0; // offset in seconds
let ntpClockInterval = null;

// Synchronize browser clock with NTP.br via local PHP proxy
async function syncNtpTime() {
    elements.ntpStatusBadge.textContent = 'Sincronizando...';
    elements.ntpStatusBadge.className = 'badge';
    elements.ntpStatusBadge.style.backgroundColor = 'rgba(251, 191, 36, 0.1)';
    elements.ntpStatusBadge.style.color = 'var(--color-warning)';
    elements.ntpStatusBadge.style.borderColor = 'rgba(251, 191, 36, 0.2)';
    
    const tStart = Date.now() / 1000;
    
    try {
        const res = await fetch('ntp_time.php');
        if (!res.ok) throw new Error('Falha HTTP');
        const data = await res.json();
        
        if (data.status === 'success') {
            const tEnd = Date.now() / 1000;
            const rtt = tEnd - tStart;
            
            // Estimated atomic timestamp when request completes (rtt/2 latency adjustment)
            const atomicTime = parseFloat(data.ntp_time) + (rtt / 2);
            
            // Offset between atomic time and client local time
            ntpTimeOffset = atomicTime - tEnd;
            
            const absOffset = Math.abs(ntpTimeOffset);
            
            if (absOffset < 1.0) {
                elements.ntpStatusBadge.textContent = 'Sincronizado';
                elements.ntpStatusBadge.style.backgroundColor = 'var(--color-success-bg)';
                elements.ntpStatusBadge.style.color = 'var(--color-success)';
                elements.ntpStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            } else {
                const diffText = ntpTimeOffset > 0 ? `+${absOffset.toFixed(1)}s` : `-${absOffset.toFixed(1)}s`;
                elements.ntpStatusBadge.textContent = `Desajuste: ${diffText}`;
                elements.ntpStatusBadge.style.backgroundColor = 'var(--color-danger-bg)';
                elements.ntpStatusBadge.style.color = 'var(--color-danger)';
                elements.ntpStatusBadge.style.borderColor = 'rgba(244, 63, 94, 0.2)';
            }
            
            startNtpClock();
        } else {
            elements.ntpStatusBadge.textContent = 'Erro NTP';
            elements.ntpStatusBadge.style.backgroundColor = 'var(--color-danger-bg)';
            elements.ntpStatusBadge.style.color = 'var(--color-danger)';
        }
    } catch (e) {
        console.warn('Erro ao sincronizar com NTP.br:', e);
        elements.ntpStatusBadge.textContent = 'Sem Sync';
        elements.ntpStatusBadge.style.backgroundColor = 'var(--color-danger-bg)';
        elements.ntpStatusBadge.style.color = 'var(--color-danger)';
        
        ntpTimeOffset = 0;
        startNtpClock();
    }
}

function startNtpClock() {
    if (ntpClockInterval) {
        clearInterval(ntpClockInterval);
    }
    
    updateNtpClockDisplay();
    ntpClockInterval = setInterval(updateNtpClockDisplay, 1000);
}

function updateNtpClockDisplay() {
    const currentNtpTimeMs = (Date.now() / 1000 + ntpTimeOffset) * 1000;
    const date = new Date(currentNtpTimeMs);
    
    const options = {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    
    elements.ntpClock.textContent = date.toLocaleTimeString('pt-BR', options);
}

// Main IP Detection Logic
async function detectIPs() {
    // Show Loading states
    setSkeletons(true);
    elements.btnRefresh.classList.add('loading');
    
    // Reset connection badges
    setBadgeStatus(elements.badgeIpv4, 'loading', 'IPv4: Detectando');
    setBadgeStatus(elements.badgeIpv6, 'loading', 'IPv6: Detectando');
    
    elements.valIpv4.textContent = '...';
    elements.valIpv6.textContent = '...';
    elements.ispIpv4.textContent = 'Buscando provedor...';
    elements.ispIpv6.textContent = 'Buscando provedor...';
    
    elements.pulseIpv4.className = 'pulse-indicator loading';
    elements.pulseIpv6.className = 'pulse-indicator loading';
    elements.indicatorTextIpv4.textContent = 'Detectando...';
    elements.indicatorTextIpv6.textContent = 'Detectando...';
    
    elements.blacklistOverallBadge.textContent = 'Aguardando...';
    elements.blacklistOverallBadge.className = 'badge';
    elements.blacklistOverallBadge.removeAttribute('data-status');
    elements.blacklistItemsContainer.innerHTML = '<li class="loading-item"><div class="skeleton skeleton-text" style="width: 100%; height: 20px;"></div></li>';
    
    state.ipv4 = null;
    state.ipv6 = null;
    
    // Concurrent fetches for IP protocol detection with fallbacks
    const [ipv4, ipv6] = await Promise.all([
        fetchIpv4WithFallback(),
        fetchIpv6WithFallback()
    ]);
    
    state.ipv4 = ipv4;
    state.ipv6 = ipv6;
    
    elements.btnRefresh.classList.remove('loading');
    
    // Update IPv4 Status Card
    if (ipv4) {
        elements.valIpv4.textContent = ipv4;
        setBadgeStatus(elements.badgeIpv4, 'active', 'IPv4: Conectado');
        elements.pulseIpv4.className = 'pulse-indicator green';
        elements.indicatorTextIpv4.textContent = 'Conexão ativa';
    } else {
        elements.valIpv4.textContent = 'Não disponível';
        setBadgeStatus(elements.badgeIpv4, 'inactive', 'IPv4: Inativo');
        elements.pulseIpv4.className = 'pulse-indicator';
        elements.indicatorTextIpv4.textContent = 'Sem conectividade';
        elements.ispIpv4.textContent = 'Não foi possível obter um IP público v4.';
    }
    
    // Update IPv6 Status Card
    if (ipv6) {
        elements.valIpv6.textContent = ipv6;
        setBadgeStatus(elements.badgeIpv6, 'active', 'IPv6: Conectado');
        elements.pulseIpv6.className = 'pulse-indicator green';
        elements.indicatorTextIpv6.textContent = 'Conexão ativa';
    } else {
        elements.valIpv6.textContent = 'Não disponível';
        setBadgeStatus(elements.badgeIpv6, 'inactive', 'IPv6: Inativo');
        elements.pulseIpv6.className = 'pulse-indicator';
        elements.indicatorTextIpv6.textContent = 'Sem conectividade';
        elements.ispIpv6.textContent = 'Sua rede/ISP atual não suporta IPv6 público.';
    }
    
    // Decide which IP to display detailed info for
    // Prefer IPv4 as standard or IPv6 if IPv4 is missing
    if (ipv4) {
        state.activeIp = ipv4;
        state.activeIpType = 'IPv4';
    } else if (ipv6) {
        state.activeIp = ipv6;
        state.activeIpType = 'IPv6';
    }
    
    // Setup Blacklist Selector options
    populateBlacklistSelector();
    
    // Fetch ISP for secondary IP if both are available
    if (ipv4 && ipv6) {
        if (state.activeIpType === 'IPv4') {
            fetch(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${ipv6}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'ok' && data.data && data.data.asns && data.data.asns.length > 0) {
                        elements.ispIpv6.textContent = `${data.data.asns[0].holder} (AS${data.data.asns[0].asn})`;
                    }
                }).catch(() => {});
        } else {
            fetch(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${ipv4}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'ok' && data.data && data.data.asns && data.data.asns.length > 0) {
                        elements.ispIpv4.textContent = `${data.data.asns[0].holder} (AS${data.data.asns[0].asn})`;
                    }
                }).catch(() => {});
        }
    }
    
    if (state.activeIp) {
        await Promise.all([
            loadIpNetworkAndBgpData(state.activeIp),
            detectDnsResolver(),
            syncNtpTime()
        ]);
    } else {
        setSkeletons(false);
        showErrorInCards('Sem conexão à Internet detectada.');
    }
}

// Utility to set connection status badges
function setBadgeStatus(badgeEl, status, text) {
    badgeEl.setAttribute('data-status', status);
    badgeEl.querySelector('.status-label').textContent = text;
}

// Populate Blacklist dropdown selector
function populateBlacklistSelector() {
    elements.blacklistIpSelect.innerHTML = '';
    
    if (state.ipv4) {
        const optV4 = document.createElement('option');
        optV4.value = 'ipv4';
        optV4.textContent = `Verificar IPv4 (${state.ipv4.substring(0, 15)}...)`;
        elements.blacklistIpSelect.appendChild(optV4);
    }
    
    if (state.ipv6) {
        const optV6 = document.createElement('option');
        optV6.value = 'ipv6';
        optV6.textContent = `Verificar IPv6 (${state.ipv6.substring(0, 15)}...)`;
        elements.blacklistIpSelect.appendChild(optV6);
    }
    
    if (!state.ipv4 && !state.ipv6) {
        const optNone = document.createElement('option');
        optNone.value = 'none';
        optNone.textContent = 'Nenhum IP disponível';
        elements.blacklistIpSelect.appendChild(optNone);
    }
}

// Show errors in information cards
function showErrorInCards(message) {
    elements.netIsp.textContent = 'Erro';
    elements.netAsn.textContent = 'N/A';
    elements.netPrefix.textContent = 'N/A';
    elements.netLocation.textContent = message;
    
    elements.bgpSpecificPrefix.textContent = 'N/A';
    elements.rpkiBadge.textContent = 'Sem dados';
    elements.rpkiBadge.setAttribute('data-rpki', 'unknown');
    
    elements.bgpVisibilityBar.style.width = '0%';
    elements.bgpVisibilityText.textContent = 'Sem dados';
    elements.bgpVisibilityPercent.textContent = '0%';
    
    elements.mapCoordVal.textContent = '- / -';
    elements.mapTimezoneVal.textContent = '-';
}

// Helper to update Network card fields and active Hero card ISP
function updateNetworkFields(asn, holder, prefix) {
    const ispText = holder ? `${holder} (AS${asn || ''})` : 'Provedor desconhecido';
    
    // Update active Hero Card ISP
    if (state.activeIpType === 'IPv4') {
        elements.ispIpv4.textContent = ispText;
    } else {
        elements.ispIpv6.textContent = ispText;
    }
    
    // Update Network Card Info
    elements.netIsp.textContent = holder || 'Não disponível';
    elements.netIsp.classList.remove('skeleton', 'skeleton-text');
    
    if (asn) {
        elements.netAsn.innerHTML = `<a href="https://stat.ripe.net/${asn}" target="_blank" rel="noopener noreferrer" class="badge badge-asn">AS${asn} <i data-lucide="external-link" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-left:2px;"></i></a>`;
    } else {
        elements.netAsn.textContent = 'Não anunciado';
    }
    elements.netAsn.classList.remove('skeleton', 'skeleton-badge');
    
    elements.netPrefix.textContent = prefix || 'Não anunciado';
    elements.netPrefix.classList.remove('skeleton', 'skeleton-text');
    
    elements.bgpSpecificPrefix.textContent = prefix || 'Não anunciado';
    elements.bgpSpecificPrefix.classList.remove('skeleton', 'skeleton-text');
}

// Main orchestrator to fetch BGP, Geolocation & RPKI data for the active IP (Progressive Rendering)
async function loadIpNetworkAndBgpData(ip) {
    setSkeletons(true);
    
    let resolvedAsn = null;
    let resolvedPrefix = null;
    let resolvedHolder = null;
    
    // 1. Handle Prefix Overview (ASN, ISP, Prefix) - Render ASAP
    const prefixPromise = fetch(`https://stat.ripe.net/data/prefix-overview/data.json?resource=${ip}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok' && data.data) {
                const rData = data.data;
                if (rData.asns && rData.asns.length > 0) {
                    resolvedAsn = rData.asns[0].asn;
                    resolvedHolder = rData.asns[0].holder;
                }
                resolvedPrefix = rData.resource;
                
                // Update network fields immediately
                updateNetworkFields(resolvedAsn, resolvedHolder, resolvedPrefix);
                
                // Trigger RPKI fetch now that we have ASN and prefix
                if (resolvedAsn && resolvedPrefix) {
                    fetchRpkiStatus(resolvedAsn, resolvedPrefix);
                }
            }
        })
        .catch(err => {
            console.error('Erro ao buscar dados RIPE prefix-overview:', err);
        });

    // 2. Handle Geolocation (Location, Map, Coordinates, Timezone) - Render ASAP
    const geolocPromise = fetchGeolocWithFallback(ip)
        .then(geoloc => {
            state.geolocData = geoloc;
            if (geoloc && geoloc.success) {
                // If Prefix Overview hasn't loaded ASN yet, use Geolocation's as fallback
                if (!resolvedAsn && geoloc.connection) {
                    resolvedAsn = geoloc.connection.asn;
                    resolvedHolder = geoloc.connection.org || geoloc.connection.isp;
                    updateNetworkFields(resolvedAsn, resolvedHolder, resolvedPrefix);
                }
                
                // Render Location Info
                const flagImg = geoloc.flag?.img ? `<img src="${geoloc.flag.img}" alt="${geoloc.country_code}" class="flag-icon" style="width:20px; vertical-align:middle; margin-right:6px; border-radius:3px; border:1px solid rgba(255,255,255,0.1)">` : '';
                elements.netLocation.innerHTML = `${flagImg} ${geoloc.city || ''}, ${geoloc.region || ''} - ${geoloc.country || ''}`;
                elements.netLocation.classList.remove('skeleton', 'skeleton-text');
                
                // Render Map
                if (geoloc.latitude && geoloc.longitude) {
                    updateMap(geoloc.latitude, geoloc.longitude, `${geoloc.city}, ${geoloc.country}`);
                    elements.mapCoordVal.textContent = `${geoloc.latitude.toFixed(5)}, ${geoloc.longitude.toFixed(5)}`;
                    
                    let timezoneText = `${geoloc.timezone || '-'} (UTC ${geoloc.timezone_offset || ''})`;
                    // Fallback to browser timezone if geoloc returned UTC/empty
                    if (!geoloc.timezone || geoloc.timezone === 'UTC') {
                        try {
                            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            const offsetMinutes = -new Date().getTimezoneOffset();
                            const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
                            const offsetMins = Math.abs(offsetMinutes) % 60;
                            const sign = offsetMinutes >= 0 ? '+' : '-';
                            const offsetStr = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;
                            timezoneText = `${localTz} (UTC ${offsetStr})`;
                        } catch (e) {
                            console.warn('Erro ao obter fuso horário local:', e);
                        }
                    }
                    
                    elements.mapTimezoneVal.textContent = timezoneText;
                    elements.mapCoordVal.classList.remove('skeleton', 'skeleton-text');
                    elements.mapTimezoneVal.classList.remove('skeleton', 'skeleton-text');
                }
            } else {
                elements.netLocation.textContent = 'Localização indisponível';
                elements.netLocation.classList.remove('skeleton', 'skeleton-text');
                elements.mapCoordVal.textContent = 'Indisponível';
                elements.mapTimezoneVal.textContent = 'Indisponível';
                elements.mapCoordVal.classList.remove('skeleton', 'skeleton-text');
                elements.mapTimezoneVal.classList.remove('skeleton', 'skeleton-text');
            }
        })
        .catch(err => {
            console.error('Erro no geolocPromise handler:', err);
        });

    // 3. Handle Routing Status (RIS Peers, Specific Prefix)
    const routingPromise = fetch(`https://stat.ripe.net/data/routing-status/data.json?resource=${ip}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok' && data.data && data.data.visibility) {
                const vData = data.data.visibility;
                const isV6 = state.activeIpType === 'IPv6';
                const vObj = isV6 ? vData.v6 : vData.v4;
                
                if (vObj && vObj.total_ris_peers > 0) {
                    const seeing = vObj.ris_peers_seeing;
                    const total = vObj.total_ris_peers;
                    const percentage = Math.round((seeing / total) * 100);
                    
                    elements.bgpVisibilityBar.style.width = `${percentage}%`;
                    elements.bgpVisibilityText.textContent = `${seeing} de ${total} roteadores RIS`;
                    elements.bgpVisibilityPercent.textContent = `${percentage}%`;
                } else {
                    elements.bgpVisibilityBar.style.width = '0%';
                    elements.bgpVisibilityText.textContent = 'Sem visibilidade RIS';
                    elements.bgpVisibilityPercent.textContent = '0%';
                }
            } else {
                elements.bgpVisibilityBar.style.width = '0%';
                elements.bgpVisibilityText.textContent = 'Sem dados de visibilidade';
                elements.bgpVisibilityPercent.textContent = '0%';
            }
        })
        .catch(err => {
            console.error('Erro ao buscar dados RIPE routing-status:', err);
            elements.bgpVisibilityBar.style.width = '0%';
            elements.bgpVisibilityText.textContent = 'Erro ao carregar';
            elements.bgpVisibilityPercent.textContent = '0%';
        });

    // Conclude all loading concurrently
    Promise.all([prefixPromise, geolocPromise, routingPromise]).then(() => {
        setSkeletons(false);
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // Run Blacklist Check
        const selectedType = elements.blacklistIpSelect.value;
        const blacklistTargetIp = selectedType === 'ipv6' ? state.ipv6 : state.ipv4;
        if (blacklistTargetIp) {
            runBlacklistCheck(blacklistTargetIp, selectedType.toUpperCase());
        }
    }).catch(err => {
        console.error('Erro geral ao processar dados de rede:', err);
        setSkeletons(false);
        showErrorInCards('Falha ao processar alguns dados.');
    });
}

// Fetch RPKI validation status via RIPE NCC API
function fetchRpkiStatus(asn, prefix) {
    elements.rpkiBadge.textContent = 'Consultando...';
    elements.rpkiBadge.setAttribute('data-rpki', 'loading');
    
    fetch(`https://stat.ripe.net/data/rpki-validation/data.json?resource=${asn}&prefix=${prefix}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'ok' && data.data) {
                const status = data.data.status;
                let badgeText = 'Desconhecido';
                let rpkiState = 'unknown';
                
                if (status === 'valid') {
                    badgeText = 'VÁLIDO (ROA)';
                    rpkiState = 'valid';
                } else if (status === 'invalid_asn' || status === 'invalid_length') {
                    badgeText = `INVÁLIDO (${status.replace('invalid_', '').toUpperCase()})`;
                    rpkiState = 'invalid';
                } else if (status === 'unknown') {
                    badgeText = 'NÃO ASSINADO (Desconhecido)';
                    rpkiState = 'unknown';
                }
                
                elements.rpkiBadge.textContent = badgeText;
                elements.rpkiBadge.setAttribute('data-rpki', rpkiState);
            } else {
                elements.rpkiBadge.textContent = 'Sem dados';
                elements.rpkiBadge.setAttribute('data-rpki', 'unknown');
            }
        })
        .catch(err => {
            console.error('Erro RPKI:', err);
            elements.rpkiBadge.textContent = 'Erro de verificação';
            elements.rpkiBadge.setAttribute('data-rpki', 'unknown');
        });
}

// Leaflet Map setup and update
function updateMap(lat, lon, label) {
    if (typeof L === 'undefined') {
        console.error('Leaflet não está carregado. Não foi possível inicializar o mapa.');
        return;
    }
    
    if (!state.map) {
        // Initialize Map
        state.map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        }).setView([lat, lon], 12);
        
        // Add dark styled map tiles from CartoDB
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(state.map);
        
        // Add custom pulse marker
        const pulseIcon = L.divIcon({
            className: 'custom-pulse-container',
            html: '<span class="pulse-marker"></span><span class="pulse-marker-ring"></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        state.mapMarker = L.marker([lat, lon], { icon: pulseIcon }).addTo(state.map);
    } else {
        // Move marker and pan map
        state.mapMarker.setLatLng([lat, lon]);
        state.map.setView([lat, lon], 12);
    }
    
    // Invalidate size helps fix leaflet initialization box errors when containers dynamically render/resize
    const invalidate = () => {
        if (state.map && typeof state.map.invalidateSize === 'function') {
            state.map.invalidateSize();
        }
    };
    
    setTimeout(invalidate, 200);
    setTimeout(invalidate, 800);
    setTimeout(invalidate, 2000);
}

// Query local PHP backend to check IP against Spamhaus, SORBS, Spamcop, etc.
function runBlacklistCheck(ip, type) {
    elements.blacklistOverallBadge.textContent = 'Verificando...';
    elements.blacklistOverallBadge.className = 'badge';
    elements.blacklistOverallBadge.setAttribute('data-status', 'checking');
    elements.blacklistItemsContainer.innerHTML = `
        <li class="loading-item">
            <i data-lucide="loader-2" class="animate-spin" style="width:24px; height:24px; animation: spin 1s linear infinite;"></i>
            <span>Verificando RBLs para ${type} (${ip})...</span>
        </li>
    `;
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    fetch(`blacklist.php?ip=${encodeURIComponent(ip)}`)
        .then(res => {
            if (!res.ok) throw new Error('Falha HTTP no script local');
            return res.json();
        })
        .then(data => {
            if (data.status === 'success') {
                renderBlacklistItems(data.blacklists);
                
                // Update overall badge
                if (data.total_listed > 0) {
                    elements.blacklistOverallBadge.textContent = `${data.total_listed} Listagens`;
                    elements.blacklistOverallBadge.setAttribute('data-status', 'listed');
                } else {
                    elements.blacklistOverallBadge.textContent = 'Limpo';
                    elements.blacklistOverallBadge.setAttribute('data-status', 'clean');
                }
            } else {
                showBlacklistError(data.message || 'Erro na verificação do backend.');
            }
        })
        .catch(err => {
            console.error('Erro de Blacklist:', err);
            showBlacklistError('Erro ao comunicar com blacklist.php. Certifique-se de que o WAMP esteja ativo.');
        });
}

// Render individual RBL results returned from blacklist.php
function renderBlacklistItems(blacklists) {
    elements.blacklistItemsContainer.innerHTML = '';
    
    for (const [name, result] of Object.entries(blacklists)) {
        const li = document.createElement('li');
        li.className = 'blacklist-item';
        li.setAttribute('data-status', result.status); // clean, listed, blocked, unsupported
        
        let statusLabel = 'Limpo';
        if (result.status === 'listed') {
            statusLabel = 'LISTADO';
        } else if (result.status === 'blocked') {
            statusLabel = 'DNS Bloqueado';
        } else if (result.status === 'unsupported') {
            statusLabel = 'Ignorado';
        }
        
        let removalLinkHtml = '';
        if (result.status === 'listed' && result.removal_url) {
            removalLinkHtml = ` • <a href="${result.removal_url}" target="_blank" rel="noopener noreferrer" class="blacklist-link" title="Ir para a página de remoção desta RBL">Remoção <i data-lucide="external-link" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-left:1px;"></i></a>`;
        }
        
        let detailsHtml = '';
        if (result.status === 'listed' && result.details) {
            detailsHtml = `<div class="blacklist-detail-text" style="font-size:0.75rem; color:var(--color-warning); margin-top:3px; font-weight:500;">Motivo: ${result.details}</div>`;
        }
        
        li.innerHTML = `
            <div class="blacklist-info">
                <span class="blacklist-name">${name}</span>
                <span class="blacklist-desc">${result.description || ''}${removalLinkHtml}</span>
                ${detailsHtml}
            </div>
            <div class="blacklist-status">
                <span class="blacklist-status-dot"></span>
                <span class="blacklist-status-text" title="${result.details}">${statusLabel}</span>
            </div>
        `;
        
        elements.blacklistItemsContainer.appendChild(li);
    }
}

// Display error in Blacklist container
function showBlacklistError(message) {
    elements.blacklistOverallBadge.textContent = 'Erro';
    elements.blacklistOverallBadge.setAttribute('data-status', 'listed');
    elements.blacklistItemsContainer.innerHTML = `
        <li class="blacklist-item" data-status="unsupported">
            <div class="blacklist-info">
                <span class="blacklist-name">Falha na verificação</span>
                <span class="blacklist-desc">${message}</span>
            </div>
            <div class="blacklist-status">
                <span class="blacklist-status-dot" style="background-color: var(--color-danger);"></span>
                <span class="blacklist-status-text" style="color: var(--color-danger)">Erro</span>
            </div>
        </li>
    `;
}

// Add simple CSS spin keyframe programmatically if needed
if (!document.getElementById('spin-keyframe')) {
    const style = document.createElement('style');
    style.id = 'spin-keyframe';
    style.innerHTML = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .animate-spin {
            animation: spin 1s linear infinite;
        }
        .flag-icon {
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
    `;
    document.head.appendChild(style);
}
