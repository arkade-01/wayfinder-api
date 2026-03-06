import { Injectable, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { ScanResult, BridgeTransfer, ExitWalletResult, RiskFlags } from '../../common/interfaces/wallet.interface';
import { CHAIN_NAMES } from '../../common/constants/bridges';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  async generatePdf(result: ScanResult): Promise<Buffer> {
    this.logger.log(`Generating PDF for ${result.address}`);
    const html = this.buildHtml(result);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  // ── HTML template - Ark Theme ──────────────────────────────────────────────

  private buildHtml(r: ScanResult): string {
    const { identity, onchain, bridges, exits, risk } = r;

    const displayAddr = (addr: string) =>
      addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;

    const chainName = (id: number | string | null) =>
      id ? (CHAIN_NAMES[Number(id)] ?? String(id)) : '—';

    const riskBadge = this.riskScore(risk);

    const identityRows = [
      ['Address', `<code>${r.address}</code>`],
      ['ENS', identity.ens ?? '—'],
      ['Twitter', identity.twitter ? `@${identity.twitter}` : '—'],
      ['Lens', identity.lens ?? '—'],
      ['Farcaster', identity.farcaster ?? '—'],
    ];

    const onchainRows = [
      ['ETH Balance', `${onchain.balanceEth.toFixed(4)} ETH`],
      ['USD Value', `$${onchain.balanceUsd.toLocaleString()}`],
      ['Transactions', onchain.txCount.toLocaleString()],
      ['Last Active', onchain.lastActive || '—'],
      ['Top Tokens', onchain.tokens.slice(0, 5).join(', ') || '—'],
    ];

    const bridgeSummaryRows = [
      ['Total Bridged', `$${bridges.totalBridgedUsd.toLocaleString()}`],
      ['Bridges Used', bridges.bridgesUsed.join(', ') || '—'],
      ['Destination Chains', bridges.destChains.join(', ') || '—'],
      ['Bridge Transfers', bridges.transfers.length.toString()],
    ];

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 11px;
    color: #e5e7eb;
    background: #0a1628;
    line-height: 1.5;
  }
  
  .header {
    background: linear-gradient(135deg, #0a1628 0%, #132240 50%, #1a3a5c 100%);
    color: #fff;
    padding: 32px 28px 24px;
    border-bottom: 2px solid #d4a853;
    position: relative;
    overflow: hidden;
  }
  
  .header::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 200px;
    height: 200px;
    background: radial-gradient(circle, rgba(212,168,83,0.1) 0%, transparent 70%);
  }
  
  .header-content {
    position: relative;
    z-index: 1;
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .compass {
    width: 36px;
    height: 36px;
    border: 2px solid #d4a853;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }
  
  .header h1 { 
    font-size: 24px; 
    letter-spacing: 4px; 
    font-weight: 700; 
    color: #d4a853;
  }
  
  .header .subtitle { 
    color: rgba(255,255,255,0.5); 
    font-size: 10px; 
    letter-spacing: 2px; 
    text-transform: uppercase;
  }
  
  .header .meta { 
    margin-top: 16px; 
    font-size: 9px; 
    color: rgba(255,255,255,0.4);
    font-family: 'Courier New', monospace;
  }
  
  .body { 
    padding: 24px 28px; 
    background: #0a1628;
  }
  
  h2 {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #d4a853;
    margin: 24px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(212,168,83,0.2);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  h2::before {
    content: '';
    width: 8px;
    height: 8px;
    background: #d4a853;
    border-radius: 50%;
  }
  
  table { 
    width: 100%; 
    border-collapse: collapse; 
    margin-bottom: 16px;
    background: rgba(255,255,255,0.02);
    border-radius: 8px;
    overflow: hidden;
  }
  
  th, td { 
    padding: 10px 14px; 
    border: 1px solid rgba(255,255,255,0.05); 
    font-size: 10px; 
  }
  
  thead th {
    background: rgba(212,168,83,0.1);
    color: #d4a853;
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 1px;
    text-transform: uppercase;
    text-align: left;
  }
  
  tbody tr:nth-child(even) { 
    background: rgba(255,255,255,0.02); 
  }
  
  tbody tr:hover {
    background: rgba(212,168,83,0.05);
  }
  
  .kv-table td:first-child { 
    font-weight: 600; 
    color: rgba(255,255,255,0.5); 
    width: 35%;
    background: rgba(255,255,255,0.02);
  }
  
  .kv-table td:last-child {
    color: #fff;
  }
  
  code {
    font-family: 'Courier New', monospace;
    font-size: 9px;
    background: rgba(255,255,255,0.1);
    padding: 2px 6px;
    border-radius: 4px;
    color: #22d3ee;
  }
  
  .risk-badge {
    display: inline-block;
    padding: 6px 16px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 1px;
  }
  
  .risk-low { 
    background: rgba(34,197,94,0.2); 
    color: #4ade80;
    border: 1px solid rgba(34,197,94,0.3);
  }
  
  .risk-medium { 
    background: rgba(234,179,8,0.2); 
    color: #fbbf24;
    border: 1px solid rgba(234,179,8,0.3);
  }
  
  .risk-high { 
    background: rgba(239,68,68,0.2); 
    color: #f87171;
    border: 1px solid rgba(239,68,68,0.3);
  }
  
  .flag { 
    display: inline-block; 
    background: rgba(239,68,68,0.2);
    color: #f87171;
    border: 1px solid rgba(239,68,68,0.3);
    border-radius: 4px; 
    padding: 3px 10px; 
    font-size: 9px; 
    font-weight: 600; 
    margin: 2px 4px 2px 0;
  }
  
  .flag.ok { 
    background: rgba(34,197,94,0.2);
    color: #4ade80;
    border: 1px solid rgba(34,197,94,0.3);
  }
  
  .cross-wallet { 
    background: rgba(234,179,8,0.1);
  }
  
  .section-note { 
    font-size: 10px; 
    color: rgba(255,255,255,0.4); 
    margin-bottom: 10px;
    font-style: italic;
  }
  
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  
  .stat-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 14px;
    text-align: center;
  }
  
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #d4a853;
  }
  
  .stat-label {
    font-size: 9px;
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 4px;
  }
  
  .identity-tag {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    margin-right: 6px;
  }
  
  .tag-ens { background: rgba(212,168,83,0.2); color: #d4a853; }
  .tag-lens { background: rgba(34,197,94,0.2); color: #4ade80; }
  .tag-farcaster { background: rgba(168,85,247,0.2); color: #c084fc; }
  .tag-twitter { background: rgba(34,211,238,0.2); color: #22d3ee; }
  
  .footer {
    margin-top: 32px;
    border-top: 1px solid rgba(255,255,255,0.1);
    padding-top: 16px;
    font-size: 9px;
    color: rgba(255,255,255,0.3);
    text-align: center;
  }
  
  .footer-logo {
    color: #d4a853;
    font-weight: 700;
    letter-spacing: 2px;
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-content">
    <div class="logo">
      <div class="compass">🧭</div>
      <div>
        <h1>WAYFINDER</h1>
        <div class="subtitle">On-Chain Intelligence Report</div>
      </div>
    </div>
    <div class="meta">
      ADDRESS: ${r.address}<br/>
      SCAN ID: ${r.scanId} &nbsp;|&nbsp; GENERATED: ${new Date(r.cachedAt).toUTCString()}
    </div>
  </div>
</div>

<div class="body">

  <!-- ── Stats Overview ── -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${onchain.balanceEth.toFixed(2)}</div>
      <div class="stat-label">ETH Balance</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${onchain.txCount}</div>
      <div class="stat-label">Transactions</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">$${bridges.totalBridgedUsd.toLocaleString()}</div>
      <div class="stat-label">Total Bridged</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: ${riskBadge.level === 'high' ? '#f87171' : riskBadge.level === 'medium' ? '#fbbf24' : '#4ade80'}">${riskBadge.label.split(' ')[0]}</div>
      <div class="stat-label">Risk Level</div>
    </div>
  </div>

  <!-- ── Risk Summary ── -->
  <h2>Risk Assessment</h2>
  <table class="kv-table">
    <tr>
      <td>Risk Score</td>
      <td><span class="risk-badge risk-${riskBadge.level}">${riskBadge.label}</span></td>
    </tr>
    <tr>
      <td>Cross-Wallet Exits</td>
      <td>${risk.crossWalletExits}</td>
    </tr>
    <tr>
      <td>Unknown Exit Wallets</td>
      <td>${risk.unknownExits}</td>
    </tr>
    <tr>
      <td>Risk Flags</td>
      <td>
        ${risk.phishingContact ? '<span class="flag">⚠ Phishing Contact</span>' : '<span class="flag ok">✓ No Phishing</span>'}
        ${risk.mixerContact    ? '<span class="flag">⚠ Mixer Contact</span>'   : '<span class="flag ok">✓ No Mixer</span>'}
        ${risk.highValueBridge ? '<span class="flag">⚠ High-Value Bridge</span>' : ''}
      </td>
    </tr>
  </table>

  <!-- ── Identity ── -->
  <h2>Identity</h2>
  <table class="kv-table">
    ${identityRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
  </table>

  ${identity.xResults?.length ? `
  <p class="section-note">Potential Twitter/X matches:</p>
  <table>
    <thead><tr><th>Username</th><th>Name</th><th>Followers</th><th>Bio</th></tr></thead>
    <tbody>
      ${identity.xResults.map((x) => `
        <tr>
          <td><span class="tag-twitter">@${x.username}</span></td>
          <td>${x.name}</td>
          <td>${x.followers.toLocaleString()}</td>
          <td>${x.bio?.slice(0, 60) || '—'}${x.bio?.length > 60 ? '...' : ''}</td>
        </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <!-- ── On-Chain Summary ── -->
  <h2>On-Chain Activity</h2>
  <table class="kv-table">
    ${onchainRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
  </table>

  ${onchain.nfts?.length ? `
  <p class="section-note">NFTs held:</p>
  <div style="margin-bottom: 16px;">
    ${onchain.nfts.slice(0, 8).map(nft => `<span class="identity-tag" style="background: rgba(168,85,247,0.2); color: #c084fc;">${nft}</span>`).join('')}
  </div>` : ''}

  <!-- ── Bridge Activity ── -->
  <h2>Bridge Activity</h2>
  <table class="kv-table">
    ${bridgeSummaryRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
  </table>

  ${bridges.transfers.length ? `
  <p class="section-note">Bridge transfers (${bridges.transfers.length} total):</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Bridge</th>
        <th>Route</th>
        <th>Token</th>
        <th>Amount</th>
        <th>Recipient</th>
      </tr>
    </thead>
    <tbody>
      ${bridges.transfers.slice(0, 15).map((t: BridgeTransfer) => `
        <tr class="${t.crossWallet ? 'cross-wallet' : ''}">
          <td>${t.date ? t.date.slice(0, 10) : '—'}</td>
          <td>${t.bridge}</td>
          <td>${t.originChain || chainName(t.originChainId)} → ${t.destChain || chainName(t.destChainId)}</td>
          <td>${t.token}</td>
          <td>${t.amountUsd ? `$${parseFloat(t.amountUsd).toLocaleString()}` : '—'}</td>
          <td>
            ${t.crossWallet
              ? `<code>${displayAddr(t.recipient)}</code> <span class="flag" style="margin-left:4px;">⚠ Cross-wallet</span>`
              : `<code>${displayAddr(t.recipient)}</code>`}
          </td>
        </tr>`).join('')}
    </tbody>
  </table>
  ${bridges.transfers.length > 15 ? `<p class="section-note">... and ${bridges.transfers.length - 15} more transfers</p>` : ''}
  ` : '<p class="section-note">No bridge transfers found.</p>'}

  <!-- ── Exit Wallets ── -->
  <h2>Exit Wallets</h2>
  ${exits.length ? `
  <p class="section-note">${exits.length} wallet(s) received cross-chain funds:</p>
  <table>
    <thead>
      <tr>
        <th>Address</th>
        <th>Chain</th>
        <th>Identity</th>
        <th>Amount</th>
        <th>Relay Txs</th>
        <th>Bridges Further</th>
      </tr>
    </thead>
    <tbody>
      ${exits.map((e: ExitWalletResult) => `
        <tr>
          <td><code>${displayAddr(e.address)}</code></td>
          <td>${e.chain}</td>
          <td>${e.identity?.ens ? `<span class="tag-ens">${e.identity.ens}</span>` : ''}${e.identity?.twitter ? `<span class="tag-twitter">@${e.identity.twitter}</span>` : ''}${!e.identity?.ens && !e.identity?.twitter ? '—' : ''}</td>
          <td>${e.amountUsd ? `$${parseFloat(e.amountUsd).toLocaleString()}` : '—'}</td>
          <td>${e.relayTxCount}</td>
          <td>${e.bridgesFurther ? '<span class="flag">⚠ Yes</span>' : '<span class="flag ok">No</span>'}</td>
        </tr>`).join('')}
    </tbody>
  </table>` : '<p class="section-note">No exit wallets detected.</p>'}

  <!-- ── Web Mentions ── -->
  ${identity.web?.length ? `
  <h2>Web Presence</h2>
  <table>
    <thead><tr><th>Title</th><th>URL</th><th>Snippet</th></tr></thead>
    <tbody>
      ${identity.web.slice(0, 6).map((w) => `
        <tr>
          <td style="color: #d4a853;">${w.title}</td>
          <td style="font-size:8px; word-break:break-all; color: rgba(255,255,255,0.4);">${w.link}</td>
          <td>${w.snippet?.slice(0, 80) || '—'}${w.snippet?.length > 80 ? '...' : ''}</td>
        </tr>`).join('')}
    </tbody>
  </table>` : ''}

</div>

<div class="footer">
  <span class="footer-logo">🧭 WAYFINDER</span><br/>
  On-Chain Intelligence · Report generated ${new Date().toUTCString()}<br/>
  Data sourced from Etherscan V2, Relay.link, LI.FI, web3.bio, SocialData
</div>

</body>
</html>`;
  }

  // ── Risk score helper ──────────────────────────────────────────────────────

  private riskScore(risk: RiskFlags): { level: 'low' | 'medium' | 'high'; label: string } {
    let score = 0;
    if (risk.crossWalletExits > 0) score += risk.crossWalletExits * 10;
    if (risk.unknownExits > 0)     score += risk.unknownExits * 5;
    if (risk.phishingContact)      score += 40;
    if (risk.mixerContact)         score += 40;
    if (risk.highValueBridge)      score += 20;

    if (score >= 40) return { level: 'high',   label: `HIGH (${score})` };
    if (score >= 15) return { level: 'medium', label: `MEDIUM (${score})` };
    return              { level: 'low',    label: `LOW (${score})` };
  }
}
