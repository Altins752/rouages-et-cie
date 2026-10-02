# Simulateur d'équilibrage (référence Python)

`model.py` joue la campagne complète avec une IA « achète l'action la plus vite rentabilisée ». Il a servi à fixer les valeurs du cadrage initial (avant les ajustements du POC v6.1).

```bash
python3 -c "from model import *; run_campaign(1.0)"        # joueur calme
python3 -c "from model import *; run_campaign(1.6)"        # joueur actif
python3 -c "from model import *; run_campaign(2.4, True)"  # zone rouge permanente
```

À porter en TypeScript (`npm run sim`) en réutilisant `src/data/balance.ts` et le vrai moteur `src/sim/`, puis à relancer avec les valeurs POC.
