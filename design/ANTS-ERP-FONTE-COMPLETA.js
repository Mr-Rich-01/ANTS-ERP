/*
 * ============================================================================
 * ANTS ERP — FONTE COMPLETA DO DESIGN (Claude Design)
 * ============================================================================
 * Esta é a lógica completa de renderização do design original ANTS ERP.
 * É uma classe `Component extends DCLogic` (framework dc-runtime do Claude Design)
 * que renderiza 22 ecrãs via `state.activeScreen`.
 *
 * USAR COMO REFERÊNCIA EXACTA para portar cada ecrã para React/Next.js.
 * Cada método/secção abaixo constrói o markup HTML de um ecrã.
 *
 * NÃO copiar o framework DCLogic — copiar o LAYOUT, ESTRUTURA, CLASSES,
 * DADOS DE EXEMPLO e ESTILOS de cada ecrã para componentes React + Tailwind.
 * ============================================================================
 */


class Component extends DCLogic {
  state = {
    collapsed: false,
    activeScreen: 'dashboard',
    theme: 'light',
    quickOpen: false,
    notifOpen: false,
    activeCat: 'Todos',
    invFilter: 'Todas',
    adminTab: 'users',
    profileType: 'client',
    prodSel: null,
    invSel: null,
    cart: [
      { id: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', price: 580, qty: 2 },
      { id: 'ANTS-COL-2', name: 'Coca-Cola 2L', price: 140, qty: 3 }
    ],
    payMethod: 'Dinheiro',
    invPayMethod: 'Transferência',
    invLines: [
      { id: 'ANTS-RICE-5', name: 'Arroz Tio 5kg', sku: 'ANTS-RICE-5', price: 580, qty: 20, disc: 5 },
      { id: 'ANTS-OIL-1', name: 'Óleo Fula 1L', sku: 'ANTS-OIL-1', price: 165, qty: 30, disc: 0 },
      { id: 'ANTS-SUG-2', name: 'Açúcar Xinavane 2kg', sku: 'ANTS-SUG-2', price: 190, qty: 15, disc: 10 }
    ]
  };

  componentDidMount() { this._cache = {}; this._applyTheme(); this._ensureIcons(); }
  componentDidUpdate() { this._applyTheme(); this._ensureIcons(); }
  _applyTheme() { try { document.documentElement.dataset.theme = this.state.theme; } catch (e) {} }

  _ensureIcons() {
    if (!window.lucide) { setTimeout(() => this._ensureIcons(), 60); return; }
    document.querySelectorAll('[data-ic]').forEach(sp => {
      const name = sp.getAttribute('data-ic'); if (!name) return;
      if (sp.firstChild && sp.getAttribute('data-ic-done') === name) return;
      sp.innerHTML = this._svg(name);
      sp.setAttribute('data-ic-done', name);
      const svg = sp.querySelector('svg');
      if (svg) { const s = sp.getAttribute('data-sz') || '18'; svg.setAttribute('width', s); svg.setAttribute('height', s); svg.setAttribute('stroke-width', sp.getAttribute('data-sw') || '1.9'); }
    });
  }
  _svg(name) {
    this._cache = this._cache || {};
    if (name in this._cache) return this._cache[name];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
    wrap.innerHTML = '<i data-lucide="' + name + '"></i>';
    document.body.appendChild(wrap);
    try { window.lucide.createIcons(); } catch (e) {}
    const svg = wrap.querySelector('svg');
    const html = svg ? svg.outerHTML : '';
    document.body.removeChild(wrap);
    this._cache[name] = html;
    return html;
  }

  fmt(n) {
    const neg = n < 0;
    const parts = Math.abs(n).toFixed(2).split('.');
    const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    return (neg ? '-' : '') + int + ',' + parts[1] + ' MT';
  }
  go(s) { this.setState({ activeScreen: s, quickOpen: false, notifOpen: false }); }
  openProfile(type) { this.setState({ activeScreen: 'entityProfile', profileType: type, quickOpen: false, notifOpen: false }); }
  addToCart(p) {
    this.setState(st => {
      const c = st.cart.slice();
      const i = c.findIndex(x => x.id === p.id);
      if (i >= 0) c[i] = { ...c[i], qty: c[i].qty + 1 };
      else c.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
      return { cart: c };
    });
  }
  changeQty(id, d) { this.setState(st => ({ cart: st.cart.map(x => x.id === id ? { ...x, qty: x.qty + d } : x).filter(x => x.qty > 0) })); }
  invQty(i, d) { this.setState(st => { const L = st.invLines.slice(); L[i] = { ...L[i], qty: Math.max(1, L[i].qty + d) }; return { invLines: L }; }); }
  invRemove(i) { this.setState(st => ({ invLines: st.invLines.filter((_, j) => j !== i) })); }
  invAdd() {
    const catalog = [
      ['ANTS-WAT-5','Água Vumba 5L',95],['ANTS-CEM-50','Cimento Dangote 50kg',720],
      ['ANTS-SOAP-1','Sabão Azul 400g',60],['ANTS-PAR-500','Paracetamol 500mg',45],['ANTS-COL-2','Coca-Cola 2L',140]
    ];
    this.setState(st => {
      const next = catalog[st.invLines.length % catalog.length];
      return { invLines: st.invLines.concat([{ id: next[0] + '-' + st.invLines.length, name: next[1], sku: next[0], price: next[2], qty: 1, disc: 0 }]) };
    });
  }

  renderVals() {
    const f = (n) => this.fmt(n);
    const accent = this.props.accent || '#13343b';
    const screen = this.state.activeScreen;
    const collapsed = this.state.collapsed;

    const titles = { dashboard:'Visão Geral', pos:'Ponto de Venda', invoices:'Facturas', invoiceNew:'Nova factura', invoiceDoc: this.state.invSel ? ('Factura ' + this.state.invSel.number) : 'Factura FT 2026/0337', clients:'Clientes', suppliers:'Fornecedores', productDetail:'Ficha de produto', receiving:'Recepção de mercadorias', poDetail:'OC 2026/0148', inventory:'Inventário', dailyClose:'Relatório diário de caixa', entityProfile:'Perfil de conta', purchases:'Compras', products:'Produtos & Stock', production:'Produção', cash:'Tesouraria', accounting:'Contabilidade', contracts:'Contratos', hr:'Recursos Humanos', reports:'Relatórios', admin:'Administração' };
    const groups = { dashboard:'Principal', pos:'Principal', invoices:'Vendas & Facturação', invoiceNew:'Vendas & Facturação', invoiceDoc:'Vendas & Facturação', clients:'Vendas & Facturação', receiving:'Compras', poDetail:'Compras', inventory:'Operações', productDetail:'Operações', dailyClose:'Finanças', suppliers:'Compras', entityProfile:'Gestão de contas', purchases:'Operações', products:'Operações', production:'Operações', cash:'Finanças', accounting:'Finanças', contracts:'Finanças', hr:'Gestão', reports:'Gestão', admin:'Gestão' };
    const icons = { dashboard:'layout-dashboard', pos:'scan-barcode', invoices:'receipt-text', clients:'user-round', suppliers:'building', receiving:'package-check', inventory:'clipboard-list', purchases:'truck', products:'package', production:'factory', cash:'wallet', accounting:'book-open', contracts:'file-signature', hr:'users', reports:'bar-chart-3', admin:'settings' };

    const navDef = [
      { label:'PRINCIPAL', items:[ ['dashboard'], ['pos'] ] },
      { label:'OPERAÇÕES', items:[ ['invoices','12'], ['clients'], ['purchases'], ['suppliers'], ['products'], ['production'] ] },
      { label:'FINANÇAS', items:[ ['cash'], ['accounting'], ['contracts'] ] },
      { label:'GESTÃO', items:[ ['hr'], ['reports'], ['admin'] ] }
    ];
    const invScreens = { invoices:1, invoiceNew:1, invoiceDoc:1 };
    const pType = this.state.profileType;
    const navGroups = navDef.map(g => ({
      label: g.label,
      items: g.items.map(([id, badge]) => {
        const active = screen === id || (id === 'invoices' && invScreens[screen]) || (id === 'purchases' && (screen === 'receiving' || screen === 'poDetail')) || (id === 'products' && (screen === 'inventory' || screen === 'productDetail')) || (id === 'cash' && screen === 'dailyClose') || (id === 'clients' && screen === 'entityProfile' && pType === 'client') || (id === 'suppliers' && screen === 'entityProfile' && pType === 'supplier');
        return {
          icon: icons[id], label: titles[id],
          onClick: () => this.go(id),
          bg: active ? 'rgba(255,255,255,.11)' : 'transparent',
          fg: active ? '#ffffff' : 'rgba(255,255,255,.62)',
          marker: active ? ('inset 3px 0 0 ' + accent) : 'none',
          badge: badge || '', showBadge: !!badge && !collapsed
        };
      })
    }));

    const T = { petroleum:['var(--accent-fg)','var(--accent-bg)'], green:['var(--ok)','var(--ok-bg)'], red:['var(--bad)','var(--bad-bg)'], amber:['var(--warn)','var(--warn-bg)'], blue:['var(--info)','var(--info-bg)'], gray:['var(--text2)','var(--bd-soft)'] };
    const kdef = [
      ['Vendas de hoje',84300,'vs ontem','+12,4%','up','green','trending-up'],
      ['Vendas do mês',1248600,'meta 78%','+8,1%','up','petroleum','calendar-days'],
      ['Lucro estimado',312150,'margem 25%','+4,6%','up','green','percent'],
      ['Caixa disponível',146250,'3 caixas abertas','estável','flat','petroleum','wallet'],
      ['Saldo bancário',502300,'4 contas','+2,1%','up','blue','landmark'],
      ['Contas a receber',728400,'23 facturas','a receber','warn','amber','arrow-down-left'],
      ['Contas a pagar',415900,'14 facturas','a pagar','down','red','arrow-up-right'],
      ['Facturas vencidas',187200,'9 em atraso','−2 vs sem.','down','red','alert-triangle']
    ];
    const tmap = { up:['var(--ok)','var(--ok-bg)','arrow-up-right'], down:['var(--bad)','var(--bad-bg)','arrow-down-right'], warn:['var(--warn)','var(--warn-bg)','clock'], flat:['var(--text2)','var(--bd-soft)','minus'] };
    const kpis = kdef.map(([label,v,sub,trend,dir,key,icon]) => ({
      label, valueStr: f(v), sub, trend,
      trendColor: tmap[dir][0], trendBg: tmap[dir][1], trendIcon: tmap[dir][2],
      iconColor: T[key][0], iconBg: T[key][1], icon
    }));

    const months = ['Jul','Ago','Set','Out','Nov','Dez','Jan','Fev','Mar','Abr','Mai','Jun'];
    const heights = [52,60,48,70,82,75,88,80,92,85,96,100];
    const barData = months.map((m,i)=>({ m, h: heights[i] }));
    const barFill = 'linear-gradient(180deg,#2a5560,' + accent + ')';

    const pay = [['Dinheiro',38,'var(--accent-fg)'],['M-Pesa',27,'var(--ok)'],['e-Mola',14,'var(--warn)'],['Transferência',12,'var(--info)'],['Cartão',9,'var(--text3)']];
    let acc = 0;
    const segs = pay.map(([l,p,c]) => { const a = acc; acc += p; return c + ' ' + (a*3.6).toFixed(1) + 'deg ' + (acc*3.6).toFixed(1) + 'deg'; });
    const donutStyle = 'conic-gradient(' + segs.join(',') + ')';
    const payLegend = pay.map(([label,p,color]) => ({ label, pct: p + '%', color }));

    const rev = [120,135,128,150,162,158,175,168,182,190,205,212];
    const exp = [95,102,99,110,118,112,121,119,128,132,140,143];
    const X = i => (i*(660/11)).toFixed(1);
    const Y = v => (220 - (v/230*200)).toFixed(1);
    const revPts = rev.map((v,i)=>X(i)+','+Y(v)).join(' ');
    const expPts = exp.map((v,i)=>X(i)+','+Y(v)).join(' ');
    const areaRev = '0,220 ' + revPts + ' 660,220';

    const topProducts = [
      { name:'Arroz Tio 5kg', qty:'1 240', w:92 },{ name:'Óleo Fula 1L', qty:'980', w:73 },
      { name:'Açúcar Xinavane 2kg', qty:'760', w:57 },{ name:'Água Vumba 5L', qty:'610', w:45 },{ name:'Coca-Cola 2L', qty:'430', w:32 }
    ];
    const alerts = [
      ['alert-triangle','var(--warn)','var(--warn-bg)','Stock baixo','14 produtos abaixo do mínimo'],
      ['calendar-clock','var(--warn)','var(--warn-bg)','Produtos a expirar','6 lotes vencem nos próximos 30 dias'],
      ['file-clock','var(--bad)','var(--bad-bg)','Facturas vencidas','9 facturas · 187 200,00 MT em atraso'],
      ['file-signature','var(--warn)','var(--warn-bg)','Contratos a renovar','3 contratos vencem esta semana'],
      ['banknote','var(--info)','var(--info-bg)','Salários por processar','Processamento de Junho pendente'],
      ['lock-open','var(--warn)','var(--warn-bg)','Caixas abertas','2 caixas ainda não foram fechadas']
    ].map(([icon,color,bg,title,desc])=>({icon,color,bg,title,desc}));
    const activities = [
      ['shopping-cart','var(--ok)','var(--ok-bg)','Maria Tembe registou a venda #VND-2041','12 500,00 MT','há 5 min'],
      ['smartphone','var(--info)','var(--info-bg)','João Macuácua recebeu pagamento M-Pesa','3 200,00 MT','há 22 min'],
      ['package-plus','var(--accent-fg)','var(--accent-bg)','Entrada de stock · 200 un. Arroz Tio 5kg','Armazém Central','há 1 h'],
      ['receipt-text','var(--accent-fg)','var(--accent-bg)','Ana Cossa criou a factura #FT-0337','48 900,00 MT','há 2 h'],
      ['lock','var(--warn)','var(--warn-bg)','Fecho de caixa · Caixa 02','sem diferenças','há 3 h']
    ].map(([icon,color,bg,title,meta,time])=>({icon,color,bg,title,meta,time}));

    const raw = [
      ['ANTS-RICE-5','Arroz Tio 5kg','Mercearia','Tio',580,420,80,'ok'],
      ['ANTS-OIL-1','Óleo Fula 1L','Mercearia','Fula',165,38,60,'low'],
      ['ANTS-SUG-2','Açúcar Xinavane 2kg','Mercearia','Xinavane',190,260,50,'ok'],
      ['ANTS-WAT-5','Água Vumba 5L','Bebidas','Vumba',95,0,40,'out'],
      ['ANTS-COL-2','Coca-Cola 2L','Bebidas','Coca-Cola',140,312,60,'ok'],
      ['ANTS-CEM-50','Cimento Dangote 50kg','Construção','Dangote',720,84,30,'ok'],
      ['ANTS-PAR-500','Paracetamol 500mg','Farmácia','Genérico',45,22,40,'low'],
      ['ANTS-SOAP-1','Sabão Azul 400g','Higiene','Lux',60,540,100,'ok'],
      ['ANTS-RICE-25','Arroz Tio 25kg','Mercearia','Tio',2650,12,15,'low']
    ];
    const stMap = { ok:['Em stock','var(--ok)','var(--ok-bg)'], low:['Stock baixo','var(--warn)','var(--warn-bg)'], out:['Esgotado','var(--bad)','var(--bad-bg)'] };
    const products = raw.map(([sku,name,cat,brand,price,stock,min,status])=>({
      sku, name, cat, brand, stock, min, priceStr: f(price),
      statusLabel: stMap[status][0], statusColor: stMap[status][1], statusBg: stMap[status][2],
      stockColor: status==='out' ? 'var(--bad)' : (status==='low' ? 'var(--warn)' : 'var(--text)'),
      onOpen: () => this.setState({ activeScreen: 'productDetail', prodSel: { sku, name, cat, brand, price, stock, min, status } })
    }));
    const stockValue = raw.reduce((a,r)=>a + r[4]*r[5], 0);

    const cats = ['Todos','Mercearia','Bebidas','Construção','Farmácia','Higiene'];
    const posCats = cats.map(label => {
      const active = this.state.activeCat === label;
      return { label, onClick: () => this.setState({ activeCat: label }),
        bg: active ? accent : 'var(--card)', fg: active ? '#fff' : 'var(--text2)', border: active ? accent : 'var(--border)' };
    });
    let posAll = raw.map(r => ({ id:r[0], name:r[1], cat:r[2], price:r[4], priceStr:f(r[4]),
      initials: r[1].replace(/[^A-Za-zÀ-ú0-9 ]/g,'').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() }));
    posAll = posAll.map(p => ({ ...p, onClick: () => this.addToCart(p) }));
    const filteredPos = this.state.activeCat === 'Todos' ? posAll : posAll.filter(p => p.cat === this.state.activeCat);

    const cart = this.state.cart.map(c => ({ ...c, priceStr: f(c.price), lineStr: f(c.price*c.qty),
      inc: () => this.changeQty(c.id, 1), dec: () => this.changeQty(c.id, -1) }));
    const sub = this.state.cart.reduce((a,c)=>a + c.price*c.qty, 0);
    const tax = sub*0.16; const total = sub + tax;
    const mkPay = (sel, setter) => [['Dinheiro','banknote'],['M-Pesa','smartphone'],['e-Mola','smartphone'],['Cartão','credit-card']].map(([label,icon]) => {
      const active = sel === label;
      return { label, icon, onClick: setter(label), bg: active ? accent : 'var(--card)', fg: active ? '#fff' : 'var(--text2)', border: active ? accent : 'var(--border)' };
    });
    const payOptions = mkPay(this.state.payMethod, (l)=>()=>this.setState({ payMethod: l }));

    const cashKpis = [
      ['Caixa disponível',146250,'petroleum','wallet','3 caixas abertas','var(--text)'],
      ['Total em bancos',502300,'blue','landmark','4 contas','var(--text)'],
      ['Entradas hoje',92400,'green','arrow-down-left','38 movimentos','var(--ok)'],
      ['Saídas hoje',38750,'red','arrow-up-right','19 movimentos','var(--bad)']
    ].map(([label,v,key,icon,sub,valColor])=>({ label, valueStr:f(v), color:T[key][0], bg:T[key][1], icon, sub, valColor }));
    const banks = [
      ['Caixa Principal','Dinheiro','— numerário —',84300,'wallet','petroleum'],
      ['BCI','Conta corrente','IBAN ···· 1234567',192400,'landmark','blue'],
      ['Millennium BIM','Conta corrente','IBAN ···· 7654321',244950,'landmark','blue'],
      ['M-Pesa','Carteira móvel','84 555 1234',46200,'smartphone','green'],
      ['e-Mola','Carteira móvel','86 222 9090',18750,'smartphone','amber']
    ].map(([name,type,number,v,icon,key])=>({ name, type, number, balanceStr:f(v), icon, color:T[key][0], bg:T[key][1] }));
    const movements = [
      ['14:32','VND-2041','Venda a dinheiro','Dinheiro','in',12500,'Maria Tembe'],
      ['13:58','REC-088','Recebimento — Distribuidora Maputo','M-Pesa','in',3200,'João Macuácua'],
      ['12:10','PAG-0145','Pagamento a fornecedor — Dangote','Transferência','out',21600,'Ana Cossa'],
      ['11:25','VND-2038','Venda a dinheiro','Dinheiro','in',8450,'Maria Tembe'],
      ['10:40','DESP-0033','Despesa — combustível','Dinheiro','out',2400,'Hélder M.'],
      ['09:15','VND-2031','Venda — e-Mola','e-Mola','in',5600,'Carlos Sitoe']
    ].map(([time,doc,desc,method,type,amount,user])=>({ time, doc, desc, method, user,
      amountStr: (type==='in'?'+ ':'− ') + f(amount), amountColor: type==='in' ? 'var(--ok)' : 'var(--bad)' }));

    // INVOICES list
    const invStatusMap = { pago:['Pago','var(--ok)','var(--ok-bg)'], parcial:['Parcial','var(--info)','var(--info-bg)'], pendente:['Pendente','var(--warn)','var(--warn-bg)'], vencido:['Vencido','var(--bad)','var(--bad-bg)'], cancelado:['Cancelado','var(--text3)','var(--bd-soft)'] };
    const invRaw = [
      ['FT 2026/0337','Distribuidora Maputo, Lda','400 785 214','23/06/2026','23/07/2026',48900,'pendente'],
      ['FT 2026/0336','Farmácia Sigma','400 112 908','22/06/2026','22/07/2026',23450,'pago'],
      ['FT 2026/0335','Restaurante Costa do Sol','400 556 711','21/06/2026','06/07/2026',15200,'parcial'],
      ['FT 2026/0334','Construções Zambeze, SA','400 901 233','18/06/2026','18/06/2026',186300,'vencido'],
      ['FT 2026/0333','Mercearia Bom Preço','400 334 122','17/06/2026','17/07/2026',8750,'pago'],
      ['FT 2026/0332','Hotel Polana Lodge','400 778 540','15/06/2026','30/06/2026',62400,'pendente'],
      ['FT 2026/0331','Auto Peças Matola','400 220 665','12/06/2026','12/06/2026',34100,'cancelado'],
      ['FT 2026/0330','Padaria Central','400 661 209','10/06/2026','10/07/2026',12980,'pago']
    ];
    const invoices = invRaw.map(([number,client,nuit,date,due,tot,st])=>({
      number, client, nuit, date, due, totalStr: f(tot),
      statusLabel: invStatusMap[st][0], statusColor: invStatusMap[st][1], statusBg: invStatusMap[st][2],
      onClick: () => this.setState({ activeScreen: 'invoiceDoc', invSel: { number, client, nuit, date, due, total: tot, status: st } }), stop: (e) => { if (e && e.stopPropagation) e.stopPropagation(); }
    }));
    const invTotal = invRaw.reduce((a,r)=>a + r[5], 0);
    const invStats = [
      ['Total facturado', f(invTotal), 'var(--text)', '8 documentos · Junho'],
      ['Recebido', f(45180), 'var(--ok)', '3 facturas pagas'],
      ['Pendente', f(111300), 'var(--warn)', '2 por receber'],
      ['Vencido', f(186300), 'var(--bad)', '1 em atraso']
    ].map(([label,value,color,sub])=>({ label, value, color, sub }));
    const invFilters = ['Todas','Pendentes','Pagas','Vencidas'].map(label => {
      const active = this.state.invFilter === label;
      return { label, onClick: () => this.setState({ invFilter: label }), bg: active ? accent : 'var(--card)', fg: active ? '#fff' : 'var(--text2)', border: active ? accent : 'var(--border)' };
    });

    // INVOICE NEW (lines)
    const invLines = this.state.invLines.map((l, i) => ({
      ...l, priceStr: f(l.price), discStr: l.disc > 0 ? l.disc + '%' : '—',
      lineStr: f(l.qty * l.price * (1 - l.disc/100)),
      inc: () => this.invQty(i, 1), dec: () => this.invQty(i, -1), remove: () => this.invRemove(i)
    }));
    const invSub = this.state.invLines.reduce((a,l)=>a + l.qty*l.price, 0);
    const invDisc = this.state.invLines.reduce((a,l)=>a + l.qty*l.price*(l.disc/100), 0);
    const invBase = invSub - invDisc;
    const invTax = invBase * 0.16;
    const invTotalNew = invBase + invTax;
    const invPayOptions = mkPay(this.state.invPayMethod, (l)=>()=>this.setState({ invPayMethod: l }));
    const docStatus = invStatusMap['pendente'];

    // EXISTING INVOICE (modo leitura) — deriva valores da factura clicada
    const isel = this.state.invSel;
    const docFromSel = !!isel;
    const dsBase = isel ? Math.round(isel.total/1.16) : 0;
    const dsTax = isel ? isel.total - dsBase : 0;
    const dsLines = isel ? [{ name:'Mercadorias e serviços facturados', sku: isel.number, qty:1, priceStr: f(dsBase), discStr:'—', lineStr: f(dsBase) }] : [];
    const dsStatus = isel ? invStatusMap[isel.status] : docStatus;

    const quickItems = [
      ['shopping-cart','Nova venda',()=>this.go('pos')],
      ['receipt-text','Nova factura',()=>this.go('invoiceNew')],
      ['banknote','Novo pagamento',()=>this.go('cash')],
      ['user-plus','Novo cliente',()=>this.setState({quickOpen:false})],
      ['building-2','Novo fornecedor',()=>this.setState({quickOpen:false})],
      ['package-plus','Novo produto',()=>this.go('products')]
    ].map(([icon,label,onClick])=>({icon,label,onClick}));
    const notifications = [
      ['alert-triangle','var(--warn)','var(--warn-bg)','Stock baixo: Óleo Fula 1L (38 un.)','há 8 min'],
      ['check-circle-2','var(--ok)','var(--ok-bg)','Pagamento M-Pesa recebido — 3 200,00 MT','há 22 min'],
      ['file-clock','var(--bad)','var(--bad-bg)','Factura #FT-0291 venceu hoje','há 1 h'],
      ['user-plus','var(--info)','var(--info-bg)','Novo cliente registado: Farmácia Sigma','há 3 h']
    ].map(([icon,color,bg,title,time])=>({icon,color,bg,title,time}));

    // PURCHASES
    const poStatus = { rascunho:['Rascunho','var(--text3)','var(--bd-soft)'], enviada:['Enviada','var(--info)','var(--info-bg)'], parcial:['Recepção parcial','var(--warn)','var(--warn-bg)'], recebida:['Recebida','var(--ok)','var(--ok-bg)'], faturada:['Facturada','var(--accent-fg)','var(--accent-bg)'] };
    const poRaw = [
      ['OC 2026/0148','Dangote Cimento, SA','400 990 112','12/06/2026','20/06/2026',216000,'parcial'],
      ['OC 2026/0147','Distribuidora Fula','400 221 884','11/06/2026','16/06/2026',49500,'recebida'],
      ['OC 2026/0146','Águas de Moçambique','400 556 003','10/06/2026','14/06/2026',28500,'faturada'],
      ['OC 2026/0145','Coca-Cola Sabco','400 778 221','08/06/2026','12/06/2026',84000,'recebida'],
      ['OC 2026/0144','Xinavane Açúcar, SA','400 112 667','06/06/2026','11/06/2026',57000,'enviada'],
      ['OC 2026/0143','Lux Higiene, Lda','400 334 909','05/06/2026','—',12000,'rascunho']
    ];
    const purchaseOrders = poRaw.map(([number,supplier,nuit,date,eta,tot,st])=>({ number, supplier, nuit, date, eta, totalStr: f(tot), statusLabel: poStatus[st][0], statusColor: poStatus[st][1], statusBg: poStatus[st][2], canReceive: st==='enviada'||st==='parcial', onReceive: () => this.go('receiving'), onOpen: () => this.go('poDetail') }));
    const poTotal = poRaw.reduce((a,r)=>a+r[5],0);
    const purchaseKpis = [
      ['Contas a pagar',f(415900),'red','arrow-up-right','14 facturas'],
      ['Ordens pendentes','5','amber','clock','aguardam recepção'],
      ['Recepções p/ conferir','3','blue','package-check','esta semana'],
      ['Fornecedores activos','38','petroleum','building-2','com saldo em aberto']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    // ACCOUNTING
    const accKpis = [
      ['Resultado do exercício',312150,'green','trending-up','margem 25%'],
      ['IVA a entregar',84200,'amber','percent','Junho 2026'],
      ['Total débitos (período)',85050,'petroleum','arrow-down-left','4 lançamentos'],
      ['Total créditos (período)',85050,'petroleum','arrow-up-right','4 lançamentos']
    ].map(([label,v,key,icon,sub])=>({ label, valueStr:f(v), color:T[key][0], bg:T[key][1], icon, sub }));
    const journal = [
      { doc:'LANC 2026/0610', date:'08/06/2026', desc:'Transferência de caixa para banco', user:'Maria Tembe', lines:[
        ['11.1','Caixa Principal','Saída de numerário',0,20000],
        ['12.1','Banco BCI','Depósito bancário',20000,0] ] },
      { doc:'LANC 2026/0611', date:'09/06/2026', desc:'Pagamento a fornecedor — Dangote', user:'Ana Cossa', lines:[
        ['22.1','Fornecedores c/c','Liquidação OC 2026/0148',30000,0],
        ['12.2','Banco BIM','Transferência bancária',0,30000] ] },
      { doc:'LANC 2026/0612', date:'10/06/2026', desc:'Venda a dinheiro com IVA', user:'Carlos Sitoe', lines:[
        ['11.1','Caixa Principal','Recebimento da venda',11600,0],
        ['71.1','Vendas de mercadorias','Venda de mercadoria',0,10000],
        ['34.3','IVA Liquidado','IVA à taxa de 16%',0,1600] ] },
      { doc:'LANC 2026/0613', date:'12/06/2026', desc:'Recebimento de cliente — Farmácia Sigma', user:'João Macuácua', lines:[
        ['12.1','Banco BCI','Recebimento FT 2026/0336',23450,0],
        ['21.1','Clientes c/c','Liquidação de factura',0,23450] ] }
    ].map(j => ({ ...j, lines: j.lines.map(([acc,name,d,deb,cred])=>({ acc, name, d,
      debStr: deb ? f(deb).replace(' MT','') : '—', credStr: cred ? f(cred).replace(' MT','') : '—',
      debCol: deb ? 'var(--text)' : 'var(--text4)', credCol: cred ? 'var(--text)' : 'var(--text4)' })) }));

    // HR
    const hrStatus = { activo:['Activo','var(--ok)','var(--ok-bg)'], ferias:['Férias','var(--info)','var(--info-bg)'], suspenso:['Suspenso','var(--warn)','var(--warn-bg)'] };
    const hrRaw = [
      ['Hélder Munguambe','HM','Director Geral','Direcção','Efectivo',95000,'activo'],
      ['Maria Tembe','MT','Operadora de Caixa','Vendas','Efectivo',22000,'activo'],
      ['João Macuácua','JM','Vendedor','Vendas','Efectivo',18500,'activo'],
      ['Ana Cossa','AC','Contabilista','Financeira','Efectivo',38000,'ferias'],
      ['Carlos Sitoe','CS','Vendedor','Vendas','Termo certo',16000,'activo'],
      ['Lúcia Mondlane','LM','Resp. de Stock','Armazém','Efectivo',27000,'activo'],
      ['Paulo Nhaca','PN','Motorista','Logística','Termo certo',14500,'suspenso'],
      ['Fátima Bila','FB','RH & Administração','Administração','Efectivo',32000,'activo']
    ];
    const employees = hrRaw.map(([name,ini,role,dept,contract,sal,st])=>({ name, ini, role, dept, contract, salStr:f(sal),
      statusLabel:hrStatus[st][0], statusColor:hrStatus[st][1], statusBg:hrStatus[st][2] }));
    const hrKpis = [
      ['Colaboradores','42','petroleum','users','7 departamentos'],
      ['Massa salarial',f(1285400),'blue','banknote','bruto mensal'],
      ['Presenças hoje','38 / 42','green','user-check','90% presença'],
      ['Em férias','3','amber','palmtree','este mês']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    // PRODUCTION
    const opStatus = { planeada:['Planeada','var(--info)','var(--info-bg)'], curso:['Em curso','var(--accent-fg)','var(--accent-bg)'], pausada:['Pausada','var(--warn)','var(--warn-bg)'], concluida:['Concluída','var(--ok)','var(--ok-bg)'], cancelada:['Cancelada','var(--text3)','var(--bd-soft)'] };
    const opRaw = [
      ['OP 2026/0061','Pão de forma 500g','800 un',65,18400,'23/06/2026','curso'],
      ['OP 2026/0060','Bolo de cenoura','120 un',40,9600,'23/06/2026','curso'],
      ['OP 2026/0059','Sumo natural 1L','500 un',0,14250,'24/06/2026','planeada'],
      ['OP 2026/0058','Pão integral 400g','1 000 un',100,22000,'22/06/2026','concluida'],
      ['OP 2026/0057','Iogurte natural 150g','600 un',30,7800,'22/06/2026','pausada'],
      ['OP 2026/0056','Bolachas caseiras','300 un',100,5400,'21/06/2026','concluida']
    ];
    const prodOrders = opRaw.map(([number,product,qty,prog,cost,date,st])=>({ number, product, qty, prog, progStr: prog+'%', costStr: f(cost), date,
      statusLabel: opStatus[st][0], statusColor: opStatus[st][1], statusBg: opStatus[st][2],
      barColor: st==='concluida' ? 'var(--ok)' : (st==='pausada' ? 'var(--warn)' : 'linear-gradient(90deg,#1b4651,#2a8d9c)') }));
    const productionKpis = [
      ['Ordens em curso','2','amber','loader','+1 planeada'],
      ['Produzido hoje','1 320 un','green','package-check','3 produtos acabados'],
      ['Custo de produção',f(287400),'petroleum','coins','mês · acumulado'],
      ['Matérias-primas em falta','3','red','alert-triangle','repor stock']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));
    const fichaTecnica = [
      ['Farinha de trigo','120 kg',4800],['Fermento de padeiro','4 kg',1200],['Óleo vegetal','10 L',1650],
      ['Açúcar branco','18 kg',720],['Sal refinado','6 kg',180],['Embalagem 500g','800 un',2400]
    ].map(([name,qty,cost])=>({ name, qty, costStr:f(cost) }));
    const prodBreakdown = [
      ['Em curso','2','var(--accent-fg)'],['Planeadas','1','var(--info)'],['Concluídas','2','var(--ok)'],['Pausadas','1','var(--warn)']
    ].map(([label,count,color])=>({label,count,color}));

    // CONTRACTS
    const ctStatus = { activo:['Activo','var(--ok)','var(--ok-bg)'], renovar:['A renovar','var(--warn)','var(--warn-bg)'], suspenso:['Suspenso','var(--info)','var(--info-bg)'], expirado:['Expirado','var(--bad)','var(--bad-bg)'], cancelado:['Cancelado','var(--text3)','var(--bd-soft)'] };
    const ctRaw = [
      ['CT 2026/0024','Farmácia Sigma','Manutenção de software','01/01/2026','31/12/2026',4500,'activo'],
      ['CT 2026/0023','Hotel Polana Lodge','Licença ERP Premium','15/06/2025','14/06/2026',12000,'renovar'],
      ['CT 2026/0022','Restaurante Costa do Sol','Suporte técnico','01/03/2026','28/02/2027',3200,'activo'],
      ['CT 2026/0021','Construções Zambeze, SA','Consultoria mensal','01/04/2026','31/03/2027',18000,'activo'],
      ['CT 2026/0020','Mercearia Bom Preço','Licença POS','10/06/2025','09/06/2026',1800,'expirado'],
      ['CT 2026/0019','Auto Peças Matola','Hospedagem cloud','01/02/2026','31/01/2027',2400,'suspenso']
    ];
    const contracts = ctRaw.map(([number,client,service,start,end,val,st])=>({ number, client, service, start, end, valStr: f(val),
      statusLabel: ctStatus[st][0], statusColor: ctStatus[st][1], statusBg: ctStatus[st][2] }));
    const contractKpis = [
      ['Contratos activos','14','petroleum','file-signature','4 serviços'],
      ['Receita recorrente',f(37700),'green','repeat','MRR · mensal'],
      ['Renovações no mês','3','blue','calendar-check','+2 automáticas'],
      ['A vencer (30 dias)','2','amber','calendar-clock','requer atenção']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));
    const renewals = [
      ['Hotel Polana Lodge','Vence em 4 dias','var(--warn)',f(12000),true],
      ['Mercearia Bom Preço','Expirado há 14 dias','var(--bad)',f(1800),true],
      ['Auto Peças Matola','Suspenso · pagamento','var(--info)',f(2400),false]
    ].map(([name,note,noteColor,valStr,canRenew])=>({ name, note, noteColor, valStr, canRenew }));
    const ctHistory = [
      ['repeat','var(--ok)','var(--ok-bg)','Renovou o contrato CT 2026/0022 por +12 meses','Ana Cossa · 22/06 14:10'],
      ['pause','var(--warn)','var(--warn-bg)','Suspendeu CT 2026/0019 por falta de pagamento','Hélder M. · 18/06 09:32'],
      ['banknote','var(--info)','var(--info-bg)','Pagamento recorrente cobrado — CT 2026/0021','Sistema · 12/06 00:05'],
      ['file-plus','var(--accent-fg)','var(--accent-bg)','Criou o contrato CT 2026/0024 — Farmácia Sigma','Maria Tembe · 05/06 11:48']
    ].map(([icon,color,bg,text,meta])=>({ icon, color, bg, text, meta }));

    // ADMIN
    const adminTabsDef = [['users','Utilizadores','users'],['sessions','Sessões','monitor-smartphone'],['audit','Auditoria','history'],['company','Empresa','building-2']];
    const adminTabs = adminTabsDef.map(([id,label,icon]) => { const a = this.state.adminTab === id; return { label, icon, onClick: () => this.setState({ adminTab: id }), bg: a ? accent : 'transparent', fg: a ? '#fff' : 'var(--text2)' }; });
    const roleColor = { 'Administrador':['var(--accent-fg)','var(--accent-bg)'], 'Contabilista':['var(--info)','var(--info-bg)'], 'Resp. Stock':['var(--warn)','var(--warn-bg)'] };
    const usersRaw = [
      ['Hélder Munguambe','helder@antscomercial.co.mz','HM','Administrador','Todas as filiais','há 4 min','activo'],
      ['Maria Tembe','maria@antscomercial.co.mz','MT','Caixa','Maputo · Caixa 01','há 12 min','activo'],
      ['Ana Cossa','ana@antscomercial.co.mz','AC','Contabilista','Sede','há 1 h','activo'],
      ['João Macuácua','joao@antscomercial.co.mz','JM','Vendedor','Matola','há 2 h','activo'],
      ['Carlos Sitoe','carlos@antscomercial.co.mz','CS','Vendedor','Maputo','ontem','activo'],
      ['Lúcia Mondlane','lucia@antscomercial.co.mz','LM','Resp. Stock','Armazém Central','há 3 dias','inactivo']
    ];
    const adminUsers = usersRaw.map(([name,email,ini,role,scope,seen,st])=>({ name, email, ini, role, scope, seen,
      roleColor: (roleColor[role]||['var(--text2)','var(--bd-soft)'])[0], roleBg: (roleColor[role]||['var(--text2)','var(--bd-soft)'])[1],
      statusLabel: st==='activo'?'Activo':'Inactivo', statusColor: st==='activo'?'var(--ok)':'var(--text3)', statusBg: st==='activo'?'var(--ok-bg)':'var(--bd-soft)' }));
    const adminRoles = [
      ['Superadministrador','1'],['Administrador','2'],['Gestor','3'],['Contabilista','2'],['Tesoureiro','1'],['Caixa','4'],['Vendedor','6'],['Resp. de Stock','2'],['Auditor','1']
    ].map(([label,count])=>({ label, count }));
    const sessState = { actual:['Esta sessão','var(--ok)','var(--ok-bg)'], activa:['Activa','var(--info)','var(--info-bg)'], expirada:['Expirada','var(--text3)','var(--bd-soft)'] };
    const adminSessions = [
      ['Hélder Munguambe','HM','MacBook Pro · Chrome','196.28.10.4','Maputo, MZ','08:12','Agora','actual'],
      ['Maria Tembe','MT','Android · App ANTS','196.28.10.55','Maputo, MZ','07:45','há 3 min','activa'],
      ['Ana Cossa','AC','Windows · Edge','41.220.3.18','Matola, MZ','09:02','há 25 min','activa'],
      ['João Macuácua','JM','iPhone · Safari','197.218.7.9','Matola, MZ','ontem 17:30','ontem 18:10','expirada']
    ].map(([name,ini,device,ip,loc,start,last,st])=>({ name, ini, device, ip, loc, start, last,
      statusLabel: sessState[st][0], statusColor: sessState[st][1], statusBg: sessState[st][2], isCurrent: st==='actual', canEnd: st!=='actual' }));
    const adminAudit = [
      ['Ana Cossa','AC','23/06 14:10','Alterou preço','Produto ANTS-OIL-1','150,00 MT','165,00 MT','196.28.10.4'],
      ['Hélder M.','HM','23/06 11:32','Anulou factura','FT 2026/0331','Activa','Cancelada','196.28.10.4'],
      ['Maria Tembe','MT','23/06 09:15','Registou venda','VND-2041','—','12 500,00 MT','196.28.10.55'],
      ['Carlos Sitoe','CS','22/06 16:48','Aplicou desconto','VND-2038','0%','10%','197.218.7.9'],
      ['Sistema','SY','22/06 00:05','Cobrança recorrente','CT 2026/0021','—','18 000,00 MT','—']
    ].map(([user,ini,when,op,record,oldV,newV,ip])=>({ user, ini, when, op, record, oldV, newV, ip }));

    // CLIENTS & SUPPLIERS
    const cliState = { devedor:['Com dívida','var(--bad)','var(--bad-bg)'], regular:['Regularizado','var(--ok)','var(--ok-bg)'], credor:['Saldo a favor','var(--info)','var(--info-bg)'] };
    const clientsRaw = [
      ['Distribuidora Maputo, Lda','DM','400 785 214','+258 84 321 0099',48900,'devedor'],
      ['Farmácia Sigma','FS','400 112 908','+258 82 110 2030',0,'regular'],
      ['Restaurante Costa do Sol','CS','400 556 711','+258 84 700 1212',15200,'devedor'],
      ['Hotel Polana Lodge','HP','400 778 540','+258 21 491 001',62400,'devedor'],
      ['Mercearia Bom Preço','BP','400 334 122','+258 86 555 0099',0,'regular'],
      ['Auto Peças Matola','AM','400 220 665','+258 84 909 8800',-3400,'credor']
    ];
    const clientsList = clientsRaw.map(([name,ini,nuit,phone,bal,st])=>({ name, ini, nuit, phone, balStr: f(bal),
      balColor: bal>0?'var(--bad)':(bal<0?'var(--info)':'var(--text3)'),
      statusLabel: cliState[st][0], statusColor: cliState[st][1], statusBg: cliState[st][2],
      onClick: () => this.openProfile('client') }));
    const clientKpis = [
      ['Total de clientes','156','petroleum','users','12 novos no mês'],
      ['Contas a receber',f(728400),'amber','arrow-down-left','23 facturas'],
      ['Clientes com dívida','23','red','alert-triangle','187 200 MT vencido'],
      ['Novos no mês','12','green','user-plus','+8% vs Maio']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    const supState = { pagar:['A pagar','var(--bad)','var(--bad-bg)'], regular:['Regularizado','var(--ok)','var(--ok-bg)'] };
    const suppliersRaw = [
      ['Dangote Cimento, SA','DC','400 990 112','+258 21 720 400',186300,'pagar'],
      ['Distribuidora Fula','DF','400 221 884','+258 84 330 1188',0,'regular'],
      ['Coca-Cola Sabco','CC','400 778 221','+258 21 460 700',84000,'pagar'],
      ['Xinavane Açúcar, SA','XA','400 112 667','+258 23 110 050',57000,'pagar'],
      ['Águas de Moçambique','AG','400 556 003','+258 21 350 900',0,'regular'],
      ['Lux Higiene, Lda','LH','400 334 909','+258 84 221 6677',12000,'pagar']
    ];
    const suppliersList = suppliersRaw.map(([name,ini,nuit,phone,bal,st])=>({ name, ini, nuit, phone, balStr: f(bal),
      balColor: bal>0?'var(--bad)':'var(--text3)',
      statusLabel: supState[st][0], statusColor: supState[st][1], statusBg: supState[st][2],
      onClick: () => this.openProfile('supplier') }));
    const supplierKpis = [
      ['Total de fornecedores','38','petroleum','building','7 categorias'],
      ['Contas a pagar',f(415900),'red','arrow-up-right','14 facturas'],
      ['Em atraso','4','amber','clock','requer pagamento'],
      ['Activos','31','green','check-circle-2','com movimento']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    const profiles = {
      client: {
        name:'Distribuidora Maputo, Lda', ini:'DM', typeLabel:'Cliente', typeColor:'var(--accent-fg)', typeBg:'var(--accent-bg)',
        nuit:'400 785 214', address:'Av. 24 de Julho, nº 1290 · Maputo', phone:'+258 84 321 0099', email:'compras@distmaputo.co.mz',
        actionLabel:'Nova factura', actionIcon:'receipt-text',
        mini:[['Saldo actual',f(48900),'var(--bad)'],['Limite de crédito',f(100000),'var(--text)'],['Facturado (ano)',f(412300),'var(--text)'],['Antiguidade média','18 dias','var(--text)']],
        extract:[
          ['01/06/2026','—','Saldo inicial','—','—',22150],
          ['05/06/2026','FT 2026/0301','Factura de venda',18900,0,41050],
          ['12/06/2026','REC-072','Recibo de pagamento',0,12000,29050],
          ['18/06/2026','FT 2026/0319','Factura de venda',24850,0,53900],
          ['23/06/2026','REC-088','Recibo de pagamento',0,5000,48900]
        ]
      },
      supplier: {
        name:'Dangote Cimento, SA', ini:'DC', typeLabel:'Fornecedor', typeColor:'var(--info)', typeBg:'var(--info-bg)',
        nuit:'400 990 112', address:'Av. das Indústrias · Matola', phone:'+258 21 720 400', email:'vendas@dangote.co.mz',
        actionLabel:'Novo pagamento', actionIcon:'banknote',
        mini:[['Saldo a pagar',f(186300),'var(--bad)'],['Crédito concedido',f(250000),'var(--text)'],['Comprado (ano)',f(1240000),'var(--text)'],['Prazo médio','30 dias','var(--text)']],
        extract:[
          ['01/06/2026','—','Saldo transportado','—','—',60300],
          ['08/06/2026','FF 2026/0148','Factura de compra',0,216000,276300],
          ['12/06/2026','PAG-0145','Pagamento parcial',90000,0,186300]
        ]
      }
    };
    const pf = profiles[pType] || profiles.client;
    const profileData = {
      ...pf,
      mini: pf.mini.map(([label,value,color])=>({ label, value, color })),
      extract: pf.extract.map(([date,doc,desc,deb,cred,saldo])=>({ date, doc, desc,
        debStr: deb==='—' ? '—' : (deb ? f(deb).replace(' MT','') : '—'),
        credStr: cred==='—' ? '—' : (cred ? f(cred).replace(' MT','') : '—'),
        debCol: (deb && deb!=='—') ? 'var(--text)' : 'var(--text4)',
        credCol: (cred && cred!=='—') ? 'var(--text)' : 'var(--text4)',
        saldoStr: f(saldo) })),
      saldoFinalStr: f(pf.extract[pf.extract.length-1][5])
    };

    // REPORTS
    const reportStats = [
      ['Total de vendas',f(1248600),'var(--text)'],['Transacções','1 842','var(--text)'],['Ticket médio',f(678),'var(--text)'],['Margem bruta','25,4%','var(--ok)']
    ].map(([label,value,color])=>({ label, value, color }));
    const salesByBranch = [
      ['Maputo · Sede','1 020',712400,'26%'],['Matola','540',358900,'24%'],['Beira','282',177300,'22%']
    ].map(([branch,count,total,margin])=>({ branch, count, totalStr:f(total), margin }));
    const reportGroups = [
      { label:'Vendas & Clientes', items:[
        ['trending-up','Relatório de vendas','Por período, produto, vendedor ou filial'],
        ['percent','Margens de lucro','Margem bruta por produto e categoria'],
        ['user-round','Extracto de clientes','Movimentos e saldos por cliente'],
        ['layers','Antiguidade de saldos','Mapa de dívidas a receber por idade'] ] },
      { label:'Compras & Stock', items:[
        ['truck','Relatório de compras','Ordens, recepções e facturas de fornecedor'],
        ['building','Extracto de fornecedores','Movimentos e saldos por fornecedor'],
        ['package','Movimentos de stock','Entradas, saídas, transferências e ajustes'],
        ['boxes','Valorização de stock','Valor do inventário por armazém'] ] },
      { label:'Finanças', items:[
        ['wallet','Fluxo de caixa','Entradas e saídas por período'],
        ['landmark','Relatório bancário','Movimentos e reconciliação por conta'],
        ['file-clock','Relatório de dívidas','Contas a receber e a pagar'],
        ['book-open','Demonstração de resultados','Receitas, custos e resultado líquido'] ] },
      { label:'Gestão & RH', items:[
        ['banknote','Relatório de salários','Folha de pagamento e encargos sociais'],
        ['factory','Relatório de produção','Ordens, consumos e custos de produção'],
        ['list','Todas as operações','Registo completo de actividades do sistema'],
        ['sliders-horizontal','Relatório personalizado','Construa o seu relatório à medida'] ] }
    ].map(g => ({ label: g.label, items: g.items.map(([icon,name,desc])=>({ icon, name, desc })) }));

    const built = ['dashboard','pos','products','productDetail','cash','dailyClose','invoices','invoiceNew','invoiceDoc','purchases','receiving','poDetail','inventory','accounting','hr','production','contracts','admin','clients','suppliers','entityProfile','reports'];

    // PRODUCT DETAIL
    const ps = this.state.prodSel || { sku:'ANTS-RICE-5', name:'Arroz Tio 5kg', cat:'Mercearia', brand:'Tio', price:580, stock:418, min:80, status:'ok' };
    const pdStMap = { ok:['Em stock','var(--ok)','var(--ok-bg)'], low:['Stock baixo','var(--warn)','var(--warn-bg)'], out:['Esgotado','var(--bad)','var(--bad-bg)'] };
    const pdCost = Math.round(ps.price*0.72);
    const pdMargin = Math.round((ps.price-pdCost)/ps.price*100);
    const pdMovesRaw = [
      ['24/06/2026','Venda','FT 2026/0337','out',12,ps.stock],
      ['23/06/2026','Recepção','GR 2026/0091','in',200,ps.stock+12],
      ['21/06/2026','Venda','FT 2026/0331','out',40,ps.stock-188],
      ['19/06/2026','Inventário','INV 2026/06','adj',-3,ps.stock-148],
      ['17/06/2026','Venda','FT 2026/0318','out',25,ps.stock-145]
    ];
    const pdMoves = pdMovesRaw.map(([date,type,doc,dir,qty,bal])=>({
      date, type, doc,
      qtyStr: (dir==='in'?'+ ':(dir==='adj'? (qty<0?'− ':'+ '):'− ')) + Math.abs(qty),
      qtyColor: dir==='in' ? 'var(--ok)' : (dir==='adj' ? 'var(--warn)' : 'var(--bad)'),
      balanceStr: String(bal),
      typeColor: dir==='in' ? 'var(--ok)' : (dir==='adj' ? 'var(--warn)' : 'var(--info)'),
      typeBg: dir==='in' ? 'var(--ok-bg)' : (dir==='adj' ? 'var(--warn-bg)' : 'var(--info-bg)')
    }));
    const pdKpis = [
      ['Stock actual', String(ps.stock) + ' un.','petroleum','package', 'mín. ' + ps.min + ' un.'],
      ['Preço de venda', f(ps.price),'green','tag','com IVA incl.'],
      ['Custo médio', f(pdCost),'blue','shopping-cart','última compra'],
      ['Margem', pdMargin + '%','amber','trending-up','por unidade']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    // PO DETAIL (ordem de compra)
    const poLinesRaw = [
      ['Cimento Dangote 50kg','saco',200,720],
      ['Cimento Dangote 25kg','saco',120,390],
      ['Reboco fino 40kg','saco',60,560],
      ['Cal hidratada 20kg','saco',40,310]
    ];
    const poLines = poLinesRaw.map(([name,unit,qty,price])=>({ name, unit, qty, priceStr: f(price), totalStr: f(qty*price) }));
    const poSub = poLinesRaw.reduce((a,r)=>a + r[2]*r[3], 0);
    const poTax = poSub*0.16;
    const poApprovals = [
      ['check','var(--ok)','var(--ok-bg)','Criada por Ana Cossa','Compras · 12/06/2026 09:14'],
      ['check','var(--ok)','var(--ok-bg)','Aprovada por Hélder Munguambe','Administração · 12/06/2026 11:40'],
      ['truck','var(--info)','var(--info-bg)','Enviada ao fornecedor','12/06/2026 14:02'],
      ['package-check','var(--warn)','var(--warn-bg)','Recepção parcial em curso','24/06/2026']
    ].map(([icon,color,bg,text,meta])=>({ icon, color, bg, text, meta }));

    // DAILY CASH CLOSE / REPORT
    const dcByMethod = [
      ['Dinheiro','banknote','var(--accent-fg)',38400,2400],
      ['M-Pesa','smartphone','var(--ok)',24600,0],
      ['e-Mola','smartphone','var(--warn)',9800,0],
      ['Transferência','landmark','var(--info)',12600,21600],
      ['Cartão','credit-card','var(--text2)',7000,0]
    ];
    const dcMethods = dcByMethod.map(([label,icon,color,inv,outv])=>({ label, icon, color, inStr: f(inv), outStr: outv? '− '+f(outv) : '—', netStr: f(inv-outv) }));
    const dcInTotal = dcByMethod.reduce((a,r)=>a+r[3],0);
    const dcOutTotal = dcByMethod.reduce((a,r)=>a+r[4],0);
    const dcCashNet = dcByMethod[0][3] - dcByMethod[0][4]; // só dinheiro físico
    const dcDenoms = [
      [1000,40],[500,30],[200,20],[100,15],[50,8],[20,5]
    ].map(([v,q])=>({ noteStr: f(v).replace(',00 MT',' MT'), qty:q, subtotalStr: f(v*q) }));
    const dcCounted = [[1000,40],[500,30],[200,20],[100,15],[50,8],[20,5]].reduce((a,d)=>a + d[0]*d[1], 0);
    const dcOpening = 25000;
    const dcExpected = dcOpening + dcCashNet;

    // INVENTORY (contagem física)
    const invntRaw = [
      ['ANTS-RICE-5','Arroz Tio 5kg','Mercearia',420,418,580],
      ['ANTS-OIL-1','Óleo Fula 1L','Mercearia',38,40,165],
      ['ANTS-SUG-2','Açúcar Xinavane 2kg','Mercearia',260,255,190],
      ['ANTS-COL-2','Coca-Cola 2L','Bebidas',312,312,140],
      ['ANTS-CEM-50','Cimento Dangote 50kg','Construção',84,80,720],
      ['ANTS-SOAP-1','Sabão Azul 400g','Higiene',540,548,60]
    ];
    const invItems = invntRaw.map(([sku,name,cat,sys,counted,cost])=>{
      const diff = counted - sys;
      return { sku, name, cat, sys, counted, diffStr: (diff>0?'+':'') + diff,
        diffColor: diff===0 ? 'var(--text3)' : (diff>0 ? 'var(--ok)' : 'var(--bad)'),
        valDiffStr: (diff>0?'+ ':(diff<0?'− ':'')) + f(Math.abs(diff*cost)),
        valDiffColor: diff===0 ? 'var(--text3)' : (diff>0 ? 'var(--ok)' : 'var(--bad)'),
        statusLabel: diff===0 ? 'Conforme' : 'Divergência',
        statusColor: diff===0 ? 'var(--ok)' : 'var(--warn)',
        statusBg: diff===0 ? 'var(--ok-bg)' : 'var(--warn-bg)' };
    });
    const invDiffValue = invntRaw.reduce((a,r)=>a + (r[4]-r[3])*r[5], 0);
    const invMatch = invntRaw.filter(r=>r[4]===r[3]).length;
    const invKpis = [
      ['Itens contados', String(invntRaw.length) + ' / ' + invntRaw.length,'petroleum','clipboard-check','100% concluído'],
      ['Conformes', String(invMatch),'green','check-circle-2','sem divergência'],
      ['Divergências', String(invntRaw.length - invMatch),'amber','alert-triangle','requer ajuste'],
      ['Impacto no valor', (invDiffValue>=0?'+ ':'− ') + f(Math.abs(invDiffValue)),'red','scale', invDiffValue>=0?'ganho de stock':'perda de stock']
    ].map(([label,valueStr,key,icon,sub])=>({ label, valueStr, color:T[key][0], bg:T[key][1], icon, sub }));

    // RECEIVING (recepção de mercadorias)
    const recLineStatus = { ok:['Conforme','var(--ok)','var(--ok-bg)'], partial:['Parcial','var(--warn)','var(--warn-bg)'], pending:['Por receber','var(--text3)','var(--bd-soft)'] };
    const recRaw = [
      ['ANTS-CEM-50','Cimento Dangote 50kg','saco',200,200,'L-DG2606','—','ok'],
      ['ANTS-CEM-25','Cimento Dangote 25kg','saco',120,80,'L-DG2607','—','partial'],
      ['ANTS-REB-40','Reboco fino 40kg','saco',60,0,'—','—','pending'],
      ['ANTS-CAL-20','Cal hidratada 20kg','saco',40,40,'L-CL114','—','ok']
    ];
    const recLines = recRaw.map(([sku,name,unit,ordered,received,lot,exp,st])=>({ sku, name, unit, ordered, received, lot, exp,
      statusLabel: recLineStatus[st][0], statusColor: recLineStatus[st][1], statusBg: recLineStatus[st][2],
      recCol: received===0 ? 'var(--text3)' : (received<ordered ? 'var(--warn)' : 'var(--text)') }));
    const recTotalOrdered = recRaw.reduce((a,r)=>a+r[3],0);
    const recTotalReceived = recRaw.reduce((a,r)=>a+r[4],0);

    return {
      accent,
      navWidth: collapsed ? 74 : 248,
      showLabels: !collapsed,
      navJustify: collapsed ? 'center' : 'flex-start',
      navGroups,
      toggleCollapse: () => this.setState(s=>({ collapsed: !s.collapsed })),
      themeIcon: this.state.theme === 'dark' ? 'sun' : 'moon',
      toggleTheme: () => this.setState(s=>({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      pageTitle: screen === 'entityProfile' ? pf.name : (titles[screen] || 'Módulo'),
      pageGroup: groups[screen] || 'ANTS ERP',
      periodLabel: 'Junho 2026',
      companyName: this.props.companyName || 'ANTS Comercial, Lda',
      companyBranch: 'Maputo · Sede',
      userName: 'Hélder Munguambe', userRole: 'Administrador', userInitials: 'HM', lastUpdate: 'há 4 min',
      quickOpen: this.state.quickOpen,
      toggleQuick: () => this.setState(s=>({ quickOpen: !s.quickOpen, notifOpen: false })),
      quickItems,
      notifOpen: this.state.notifOpen,
      toggleNotif: () => this.setState(s=>({ notifOpen: !s.notifOpen, quickOpen: false })),
      notifications,

      isDashboard: screen === 'dashboard',
      isPos: screen === 'pos',
      isProducts: screen === 'products',
      isCash: screen === 'cash',
      isDailyClose: screen === 'dailyClose',
      goDailyClose: () => this.go('dailyClose'),
      backToCash: () => this.go('cash'),
      dcMethods, dcInTotalStr: f(dcInTotal), dcOutTotalStr: '− ' + f(dcOutTotal), dcNetTotalStr: f(dcInTotal-dcOutTotal),
      dcDenoms, dcCountedStr: f(dcCounted), dcOpeningStr: f(dcOpening),
      dcCashInStr: f(dcByMethod[0][3]), dcCashOutStr: '− ' + f(dcByMethod[0][4]),
      dcExpectedStr: f(dcExpected),
      dcDiffStr: f(dcCounted - dcExpected),
      dcDiffColor: (dcCounted - dcExpected) === 0 ? 'var(--ok)' : 'var(--bad)',
      isInvoices: screen === 'invoices',
      isInvoiceNew: screen === 'invoiceNew',
      isInvoiceDoc: screen === 'invoiceDoc',
      isPlaceholder: built.indexOf(screen) === -1,
      placeholderTitle: titles[screen] || '', placeholderIcon: icons[screen] || 'layers',
      goDash: () => this.go('dashboard'),
      goInvoices: () => this.go('invoices'),
      goInvoiceNew: () => this.go('invoiceNew'),
      goInvoiceDoc: () => this.go('invoiceDoc'),
      invAddLine: () => this.invAdd(),
      doPrint: () => { try { window.print(); } catch (e) {} },

      kpis, barData, barFill, donutStyle, payLegend, topProducts, alerts, activities, revPts, expPts, areaRev,
      posCats, filteredPos, cart, cartEmpty: this.state.cart.length === 0,
      subStr: f(sub), taxStr: f(tax), totalStr: f(total), payOptions, clearCart: () => this.setState({ cart: [] }),
      products, productCount: products.length, stockValueStr: f(stockValue),
      isProductDetail: screen==='productDetail',
      pdName: ps.name, pdSku: ps.sku, pdCat: ps.cat, pdBrand: ps.brand,
      pdStatusLabel: pdStMap[ps.status][0], pdStatusColor: pdStMap[ps.status][1], pdStatusBg: pdStMap[ps.status][2],
      pdKpis, pdMoves, pdMinStr: String(ps.min), pdStockStr: String(ps.stock),
      backToProductsList: () => this.go('products'),
      cashKpis, banks, movements,
      fAbertura: f(25000), fEntradas: '+ ' + f(92400), fSaidas: '− ' + f(38750),
      fEsperado: f(78650), fContado: f(78650), fDiferenca: f(0), operatorName: 'Maria Tembe — Caixa 01',

      invStats, invoices, invCount: invRaw.length, invTotalStr: f(invTotal), invFilters,
      invLines, invLineCount: this.state.invLines.length,
      invSubStr: docFromSel ? f(dsBase) : f(invSub), invDiscStr: docFromSel ? '—' : '− ' + f(invDisc), invBaseStr: docFromSel ? f(dsBase) : f(invBase),
      invTaxStr: docFromSel ? f(dsTax) : f(invTax), invTotalNewStr: docFromSel ? f(isel.total) : f(invTotalNew), invPayOptions, invPayMethod: this.state.invPayMethod,
      invLines: docFromSel ? dsLines : invLines, invLineCount: docFromSel ? dsLines.length : this.state.invLines.length,
      docNumber: docFromSel ? isel.number : 'FT 2026/0337', docStatusLabel: dsStatus[0], docStatusColor: dsStatus[1], docStatusBg: dsStatus[2],
      docClient: docFromSel ? isel.client : 'Distribuidora Maputo, Lda',
      docClientAddr: docFromSel ? 'Maputo · Moçambique' : 'Av. 24 de Julho, nº 1290 · Maputo',
      docClientNuit: docFromSel ? isel.nuit : '400 785 214',
      docDate: docFromSel ? isel.date : '23/06/2026', docDue: docFromSel ? isel.due : '23/07/2026',

      isPurchases: screen==='purchases', purchaseKpis, purchaseOrders, poCount: poRaw.length, poTotalStr: f(poTotal),
      isReceiving: screen==='receiving', recLines, recTotalOrdered, recTotalReceived,
      isPoDetail: screen==='poDetail', poLines,
      goReceiveFromPo: () => this.go('receiving'),
      poSubStr: f(poSub), poTaxStr: f(poTax), poGrandStr: f(poSub+poTax), poApprovals,
      isInventory: screen==='inventory', invItems, invKpis, invDiffValueStr: (invDiffValue>=0?'+ ':'− ') + f(Math.abs(invDiffValue)), invDiffColor: invDiffValue>=0?'var(--ok)':'var(--bad)',
      goInventory: () => this.go('inventory'), backToProducts: () => this.go('products'),
      recProgress: Math.round(recTotalReceived/recTotalOrdered*100) + '%',
      backToPurchases: () => this.go('purchases'),
      isAccounting: screen==='accounting', accKpis, journal, accDebTotal: f(85050), accCredTotal: f(85050),
      isHr: screen==='hr', hrKpis, employees, empCount: employees.length,
      hrBrutoStr: f(1285400), hrSubsStr: '+ ' + f(142000), hrInssStr: '− ' + f(38562), hrIrpsStr: '− ' + f(168200), hrLiquidoStr: f(1220638),

      isProduction: screen==='production', productionKpis, prodOrders, opCount: opRaw.length,
      fichaTecnica, fichaTotal: f(10950), fichaUnit: f(10950/800), prodBreakdown,

      isContracts: screen==='contracts', contractKpis, contracts, ctCount: ctRaw.length, renewals, ctHistory,

      isAdmin: screen==='admin', adminTabs,
      isAdminUsers: this.state.adminTab==='users', isAdminSessions: this.state.adminTab==='sessions',
      isAdminAudit: this.state.adminTab==='audit', isAdminCompany: this.state.adminTab==='company',
      adminUsers, adminRoles, adminSessions, adminAudit,

      isClients: screen==='clients', clientKpis, clientsList, clientCount: clientsRaw.length,
      isSuppliers: screen==='suppliers', supplierKpis, suppliersList, supplierCount: suppliersRaw.length,
      isEntityProfile: screen==='entityProfile', profileData,
      isReports: screen==='reports', reportStats, salesByBranch, reportGroups,
      goClients: () => this.go('clients'), goSuppliers: () => this.go('suppliers'),
      backToList: () => this.go(pType === 'supplier' ? 'suppliers' : 'clients')
    };
  }
}
