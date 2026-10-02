MAXU=4
HORIZON=1800
RED_MAINT=5; RED_UPTIME=0.9
import math, copy
ST=['Découpe','Frappe','Taraudage','Contrôle']
BASE=[4.0,6.0,5.0,2.0]                     # s, manuel, fonte
W_ST=[0.8,1.2,1.0,0.7]                     # poids de prix par poste
SPEED=[[1,1,1,1],[3.5,3.0,3.3,2.5],[8,7.5,9,6],[28,25,32,22],[100,95,110,90]]
TIER_NAME=['Manuel','Mécanique','Semi-auto','Robotisé','Usine noire']
P_UNIT=[30,150,2000,30000,600000]
UNIT_GROWTH=1.35
KW=[0,1.5,25,150,2500]
OP_LEVEL=[1,2,3,0,0]                       # niveau requis (0 = robot)
SAL=[0,0.03,0.10,0.35,1.5]                 # €/s par niveau
TRAIN=[0,0,100,800,15000]
R_TIER=[0,300,25000,5e5,5e7]
# matériaux : nom, valeur, matière, facteur k, palier min, R&D
MAT=[('Fonte',3,0.6,1.0,0,0),('Acier doux',7,1.8,1.3,0,500),('Laiton',18,5,1.1,1,8000),
     ('Inox',50,16,1.7,1,30000),('Titane',160,55,2.4,2,4e5),('Carbure',600,220,3.2,3,8e6),
     ('Diamant',3000,1200,4.5,4,1.5e8)]
E_PRICE=0.04        # € par kW·s
MAINT=0.02/3600     # part du prix d'une unité par seconde de marche (2 %/h)
WALK=1.0
MORAL=0.9           # efficacité moyenne (moral + spécialisation)
ACTS=[  # nom, marché (€/s), chaînes max, objectif, frais de hall de base
 ('Prologue — Le quartier',2,1,('debt',400),0),
 ('Acte I — La ville',24,2,('share',0.5),400),
 ('Acte II — La région',1000,4,('share',0.5),3000),
 ('Acte III — Le pays',16000,8,('share',0.5),15000),
 ('Acte IV — Le monde',1e7,16,('cash',1.5e9),1e5),
]
GATE_TIER={3:3,4:4}; GATE_MAT={5:4,6:4}
CH_GROWTH=1.8
def matfac(s,k):
    return [1+(k-1)*0.5,k,k,1+(k-1)*0.3][s]
def cycle(t,s,m,bonus):
    return BASE[s]*matfac(s,MAT[m][3])/SPEED[t][s]/bonus
def new_chain():
    return {'t':[0,0,0,0],'n':[1,1,1,1],'w':1,'m':0}
def chain_capacity(c,bonus):
    cyc=[cycle(c['t'][s],s,c['m'],bonus) for s in range(4)]
    need=[c['n'][s] if c['t'][s]<3 else 0 for s in range(4)]
    W=c['w']
    if sum(need)>W and W<sum(1 for s in range(4) if need[s]>0):
        # ouvriers polyvalents : chacun fait la pièce entière
        manual=[s for s in range(4) if need[s]>0]
        robot=[1/cyc[s]*c['n'][s] for s in range(4) if need[s]==0]
        t=sum(cyc[s] for s in manual)+WALK*len(manual)
        cap=W/t*MORAL
        return min([cap]+robot)
    ops=[0]*4; left=W
    for s in range(4):
        if need[s]>0: ops[s]=1; left-=1
    while left>0:
        cand=[s for s in range(4) if need[s]>ops[s]]
        if not cand: break
        s=min(cand,key=lambda s:ops[s]/cyc[s]); ops[s]+=1; left-=1
    caps=[(ops[s] if need[s]>0 else c['n'][s])/cyc[s] for s in range(4)]
    return min(caps)*MORAL
def chain_costs(c,thr,bonus):
    cyc=[cycle(c['t'][s],s,c['m'],bonus) for s in range(4)]
    kw=0;maint=0
    for s in range(4):
        cap_s=c['n'][s]/cyc[s]
        occ=min(1,thr/cap_s) if cap_s>0 else 0
        k=KW[c['t'][s]]*c['n'][s]*(0.3+0.7*occ)     # veille = 30 %
        kw+=k; maint+=P_UNIT[c['t'][s]]*W_ST[s]*c['n'][s]*MAINT*(0.3+0.7*occ)
    lvl=max([OP_LEVEL[c['t'][s]] for s in range(4)]+[1])
    sal=c['w']*SAL[lvl]
    if max(c['t'])>=3: sal+=SAL[4]
    return kw,maint,sal

def chain_costs(c,thr,bonus):
    cyc=[cycle(c['t'][s],s,c['m'],bonus) for s in range(4)]
    kw=0;maint=0;sal=0;need=0
    for s in range(4):
        cap_s=c['n'][s]/cyc[s]
        occ=min(1,thr/cap_s) if cap_s>0 else 0
        kw+=KW[c['t'][s]]*c['n'][s]*(0.3+0.7*occ)
        maint+=P_UNIT[c['t'][s]]*W_ST[s]*c['n'][s]*MAINT*(0.3+0.7*occ)
        if c['t'][s]<3:
            k=min(c['n'][s],max(0,c['w']-need)); need+=k
            sal+=k*SAL[OP_LEVEL[c['t'][s]]]
    sal+=max(0,c['w']-need)*SAL[1]
    if max(c['t'])>=3: sal+=SAL[4]
    return kw*E_PRICE,maint,sal

class Game:
    def __init__(s,act,research,sf,capital,tapmul=1.0,redzone=False):
        s.act=act; s.R=research; s.sf=sf; s.money=capital; s.ch=[new_chain()]
        s.tap=tapmul; s.red=redzone; s.t=0; s.ca=0; s.sold_rate=0; s.cum_net=0
        s.demand=ACTS[act][1]; s.maxch=ACTS[act][2]; s.spent=0; s.log=[]
    def bonus(s): return 1+0.03*s.sf
    def rates(s,chs=None):
        chs=chs or s.ch; b=s.bonus()
        prod=[chain_capacity(c,b)*(RED_UPTIME if s.red else 1) for c in chs]
        tot=sum(prod); pot=sum(p*MAT[c['m']][1] for c,p in zip(chs,prod))
        f=min(1,s.demand/pot) if pot>0 else 0; sell=0
        rev=0;cost=0
        for c,p in zip(chs,prod):
            q=p*f; v=MAT[c['m']][1];raw=MAT[c['m']][2]
            e,mt,sl=chain_costs(c,q,b)
            if s.red: mt*=RED_MAINT
            rev+=q*v; sell+=q*v; cost+=q*raw+e+mt+sl
        return rev,cost,sell
    def profit(s,chs=None):
        r,c,_=s.rates(chs); return r-c
    def unit_cost(s,c,st,t,n_existing):
        return P_UNIT[t]*W_ST[st]*UNIT_GROWTH**max(0,n_existing-1)
    def actions(s):
        A=[]
        for i,c in enumerate(s.ch):
            # embaucher un ouvrier
            d=copy.deepcopy(c); d['w']+=1; A.append(('hire',i,None,TRAIN[1],d))
            for st in range(4):
                t=c['t'][st]
                # ajouter une unité (+ opérateur formé)
                if c['n'][st]<8:
                    d=copy.deepcopy(c); d['n'][st]+=1
                    cost=s.unit_cost(c,st,t,c['n'][st]+1)
                    if t<3: d['w']+=1; cost+=TRAIN[OP_LEVEL[t]]
                    A.append(('unit',i,st,cost,d))
                # monter de palier (1 unité du nouveau palier)
                if t<4 and s.R['tier']>t:
                    d=copy.deepcopy(c); d['t'][st]=t+1; old=d['n'][st]; d['n'][st]=1
                    cost=s.unit_cost(c,st,t+1,1)-0.25*sum(s.unit_cost(c,st,t,k) for k in range(1,old+1))
                    if t+1<3: cost+=TRAIN[OP_LEVEL[t+1]]
                    A.append(('tier',i,st,max(cost,1),d))
            for m in range(len(MAT)):
                if m!=c['m'] and s.R['mat']>=m and min(c['t'][1],c['t'][2])>=MAT[m][4]:
                    d=copy.deepcopy(c); d['m']=m; A.append(('mat',i,m,1,d))
        if len(s.ch)<s.maxch:
            best=max(s.ch,key=lambda c:chain_capacity(c,s.bonus()))
            cost=sum(sum(s.unit_cost(best,st,best['t'][st],k) for k in range(1,best['n'][st]+1)) for st in range(4))
            cost=cost*1.2+800*6**len(s.ch)
            A.append(('chain',None,None,cost,copy.deepcopy(best)))
        return A
    def research_next(s):
        opts=[]
        if s.R['tier']<4: opts.append(('rtier',R_TIER[s.R['tier']+1]))
        if s.R['mat']<len(MAT)-1:
            m=s.R['mat']+1
            if MAT[m][4]<=s.R['tier']: opts.append(('rmat',MAT[m][5]))
        return opts
    def step_ai(s):
        base=s.profit()
        best=None
        for a in s.actions():
            kind,i,x,cost,d=a
            if kind=='chain': chs=s.ch+[d]
            else: chs=s.ch[:i]+[d]+s.ch[i+1:]
            g=s.profit(chs)-base
            if g<=0: continue
            if kind=='mat': cost=0.01
            pb=cost/g
            if best is None or pb<best[0]: best=(pb,a,chs)
        # recherche : si stagnation ou si abordable sans gros sacrifice
        for kind,cost in s.research_next():
            if s.money>=cost and (best is None or best[0]>240 or cost<0.2*s.money):
                s.money-=cost; s.spent+=cost
                if kind=='rtier': s.R['tier']+=1
                else: s.R['mat']+=1
                s.log.append((s.t,kind,s.R['tier'] if kind=='rtier' else MAT[s.R['mat']][0]))
                return
        if best and s.money>=best[1][3]:
            s.money-=best[1][3]; s.spent+=best[1][3]; s.ch=best[2]
    def objective(s):
        kind,v=ACTS[s.act][3]
        if kind=='debt': return s.cum_net>=v
        if kind=='share': return s.sold_rate>=v*s.demand
        if kind=='ca': return s.ca>=v
        if kind=='cash': return s.money>=v
    def run(s,limit=4e5,dt=1.0):
        while s.t<limit:
            r,c,sold=s.rates(); s.sold_rate=sold
            net=r-c; s.money+=net*dt; s.ca+=r*dt; s.cum_net+=net*dt; s.t+=dt
            if s.money<0: s.money=0
            if int(s.t)%3==0: s.step_ai()
            if s.objective(): return s.t
        return None
    def assets(s):
        return sum(sum(s.unit_cost(c,st,c['t'][st],k) for k in range(1,c['n'][st]+1)) for c in s.ch for st in range(4))

def campaign(tapmul=1.0,redzone=False,verbose=False,sf_k=0.4,cap_frac=0.15):
    R={'tier':0,'mat':0}; sf=0; capital=0; out=[]
    for a in range(len(ACTS)):
        g=Game(a,R,sf,capital,tapmul,redzone)
        t=g.run()
        if t is None: out.append((ACTS[a][0],None)); break
        real=t/tapmul
        gain=int((g.ca/1000)**sf_k)
        out.append((ACTS[a][0],t,real,len(g.ch),g.ch[0]['t'][:],MAT[g.ch[0]['m']][0],R['tier'],R['mat'],gain,g.money))
        if verbose:
            print(f"{ACTS[a][0]:28s} jeu {t/60:7.1f} min  réel {real/60:7.1f} min  chaînes {len(g.ch)} paliers {g.ch[0]['t']} n {g.ch[0]['n']} mat {MAT[g.ch[0]['m']][0]:10s} SF+{gain}  R={R}")
        sf+=gain; capital=cap_frac*g.assets()
    return out

def caps_of(c,b):
    cyc=[cycle(c['t'][s],s,c['m'],b) for s in range(4)]
    return [c['n'][s]/cyc[s] for s in range(4)]
def ops_needed(c): return sum(c['n'][s] for s in range(4) if c['t'][s]<3)
def balance(g,c,target):
    """ajoute des unités au poste le plus faible jusqu'à dépasser target (écrous/s)"""
    d=copy.deepcopy(c); cost=0; b=g.bonus()
    for _ in range(12):
        caps=caps_of(d,b)
        if min(caps)*MORAL>=target: break
        s=min(range(4),key=lambda s:caps[s])
        if d['n'][s]>=MAXU: return None
        cost+=g.unit_cost(d,s,d['t'][s],d['n'][s]+1); d['n'][s]+=1
        if d['t'][s]<3: cost+=TRAIN[OP_LEVEL[d['t'][s]]]
    need=ops_needed(d)
    if d['w']<need: d['w']=need
    return d,cost
def modernize(g,c,f=1.3):
    """passe toute la chaîne au palier suivant, avec assez d'unités pour f × le débit actuel"""
    b=g.bonus(); t=min(c['t'])
    if t>=g.R['tier']: return None
    d=copy.deepcopy(c); cost=0; old_thr=chain_capacity(c,b)
    for s in range(4):
        if d['t'][s]==t:
            cost-=0.25*sum(g.unit_cost(c,s,t,k) for k in range(1,c['n'][s]+1))
            d['t'][s]=t+1; d['n'][s]=1; cost+=g.unit_cost(d,s,t+1,1)
            if t+1<3: cost+=TRAIN[OP_LEVEL[t+1]]
    r=balance(g,d,max(old_thr*f,1e-6))
    if r is None: return None
    d,c2=r; d['w']=ops_needed(d)
    best_m=d['m']; bp=-1e18
    for m in range(len(MAT)):
        if g.R['mat']>=m and min(d['t'][1],d['t'][2])>=MAT[m][4]:
            d['m']=m; p=g.profit(g.ch+[d]) if False else chain_profit(g,d)
            if p>bp: bp=p; best_m=m
    d['m']=best_m
    return d,max(cost+c2,1)

def chain_profit(g,c):
    b=g.bonus(); q=chain_capacity(c,b); e,mt,sl=chain_costs(c,q,b)
    return q*(MAT[c['m']][1]-MAT[c['m']][2])-e-mt-sl

def actions2(g):
    A=[]; b=g.bonus()
    for i,c in enumerate(g.ch):
        thr=chain_capacity(c,b)
        for f in (1.15,1.5):
            r=balance(g,c,thr*f+1e-3)
            if r: A.append(('balance',i,f,r[1],r[0]))
        for f in (1.3,2,3):
            r=modernize(g,c,f)
            if r: A.append(('modern',i,f,r[1],r[0]))
        if c['w']<ops_needed(c) or (c['w']<4 and ops_needed(c)>c['w']):
            d=copy.deepcopy(c); d['w']+=1; A.append(('hire',i,None,1,d))
        for m in range(len(MAT)):
            if m>c['m'] and g.R['mat']>=m and min(c['t'][1],c['t'][2])>=MAT[m][4]:
                d=copy.deepcopy(c); d['m']=m; A.append(('mat',i,m,0.01,d))
    if len(g.ch)<g.maxch:
        best=max(g.ch,key=lambda c:chain_capacity(c,b))
        cost=sum(sum(g.unit_cost(best,st,best['t'][st],k) for k in range(1,best['n'][st]+1)) for st in range(4))
        cost=cost*1.2+ACTS[g.act][4]*CH_GROWTH**(len(g.ch)-1)
        A.append(('chain',None,None,cost,copy.deepcopy(best)))
    return A

def step_ai2(g):
    base=g.profit(); best=None
    for a in actions2(g):
        kind,i,x,cost,d=a
        chs=g.ch+[d] if kind=='chain' else g.ch[:i]+[d]+g.ch[i+1:]
        gain=g.profit(chs)-base
        if gain<=0: continue
        pb=cost/gain
        if best is None or pb<best[0]: best=(pb,a,chs)
    # recherche
    full_tier=all(min(c['t'])>=g.R['tier'] for c in g.ch)
    full_mat=all(c['m']>=g.R['mat'] for c in g.ch)
    opts=[]
    if g.R['tier']<4 and full_tier and g.act>=GATE_TIER.get(g.R['tier']+1,0): opts.append(('rtier',R_TIER[g.R['tier']+1]))
    m=g.R['mat']+1
    if m<len(MAT) and full_mat and MAT[m][4]<=g.R['tier'] and g.act>=GATE_MAT.get(m,0): opts.append(('rmat',MAT[m][5]))
    opts.sort(key=lambda o:o[1])
    for kind,cost in opts[:1]:
        if g.money>=cost and (best is None or best[0]>180):
            g.money-=cost; g.spent+=cost
            if kind=='rtier': g.R['tier']+=1
            else: g.R['mat']+=1
            g.log.append((round(g.t),kind,g.R['tier'] if kind=='rtier' else MAT[g.R['mat']][0])); return
    if best and best[0]<HORIZON and g.money>=best[1][3]:
        g.money-=best[1][3]; g.spent+=best[1][3]; g.ch=best[2]
        g.log.append((round(g.t),best[1][0],round(best[1][3])))
Game.step_ai=step_ai2

def run_campaign(tap=1.0,red=False,limit_h=10,verbose=True):
    R={'tier':0,'mat':0};sf=0;cap=0;res=[]
    for a in range(5):
        g=Game(a,R,sf,cap,tap,red)
        t=g.run(limit=3600*limit_h)
        r,c,so=g.rates()
        if verbose: print(f"{ACTS[a][0]:26s}",'FIN' if t else 'BLOQUÉ',f"{(t or g.t)/60:6.0f} min jeu {(t or g.t)/60/tap:6.0f} min réel | rev {r:9.3g} €/s net {r-c:9.3g} | ch {len(g.ch)} paliers {g.ch[-1]['t']} n {g.ch[-1]['n']} {MAT[g.ch[-1]['m']][0]} | R {R} SF {sf}")
        res.append((a,t,g))
        if t is None: break
        gain=int((g.ca/1e4)**0.3); sf+=gain; cap=0.15*g.assets()
    return res

def diag(g,n=6):
    base=g.profit(); out=[]
    for x in actions2(g):
        k,i,f,cost,d=x
        chs=g.ch+[d] if k=='chain' else g.ch[:i]+[d]+g.ch[i+1:]
        gn=g.profit(chs)-base
        out.append((round(cost/gn) if gn>0 else 10**12,k,i,f,round(cost),round(gn,1),d['t'],d['n'],MAT[d['m']][0]))
    for o in sorted(out)[:n]: print('   ',o)
