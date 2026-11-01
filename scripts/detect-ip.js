const os = require('os');

function getLocalIp() {
  const ifaces = os.networkInterfaces();

  // 1. Prioritize Wi-Fi / Wireless adapters
  for (const [name, addrs] of Object.entries(ifaces)) {
    const lower = name.toLowerCase();
    if (
      lower.includes('wi-fi') ||
      lower.includes('wifi') ||
      lower.includes('wlan') ||
      lower.includes('inalámbrica') ||
      lower.includes('inalambrica')
    ) {
      for (const a of addrs) {
        if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
          return a.address;
        }
      }
    }
  }

  // 2. Physical Ethernet (excluding VirtualBox, WSL, Hyper-V, Hamachi)
  for (const [name, addrs] of Object.entries(ifaces)) {
    const lower = name.toLowerCase();
    if (
      lower.includes('wsl') ||
      lower.includes('vethernet') ||
      lower.includes('virtual') ||
      lower.includes('hamachi') ||
      lower.includes('docker') ||
      lower.includes('loopback')
    ) {
      continue;
    }

    for (const a of addrs) {
      if (
        a.family === 'IPv4' &&
        !a.internal &&
        !a.address.startsWith('169.254.') &&
        !a.address.startsWith('192.168.56.')
      ) {
        return a.address;
      }
    }
  }

  // 3. Fallback to any non-internal IPv4
  for (const [, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        return a.address;
      }
    }
  }

  return '127.0.0.1';
}

console.log(getLocalIp());
