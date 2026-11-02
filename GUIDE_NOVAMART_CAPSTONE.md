# 🚀 PROJET FINAL CAPSTONE : NOVAMART ENTERPRISE MULTI-AGENT

> Le projet complet Udacity (fichiers sources, tests, templates et scripts de déploiement) est installé dans :
> `cd14764-aws-agentic-c3-classroom/project/starter/`

Le guide complet et pédagogique d'implémentation rédigé spécialement pour vous se trouve ici :
👉 **[GUIDE_DU_PROJET_NOVAMART.md](file:///C:/Users/Develo/Documents/antigravity/mysterious-franklin/cd14764-aws-agentic-c3-classroom/project/starter/GUIDE_DU_PROJET_NOVAMART.md)**

---

### Résumé des 7 Commandes Clés à Connaître :

1. **Se positionner dans le répertoire du projet :**
   ```bash
   cd cd14764-aws-agentic-c3-classroom/project/starter
   ```

2. **Vérifier les ressources AWS déployées :**
   ```bash
   python config.py
   ```

3. **Tester Task 2 (Le Graphe Multi-Agents dans `src/agent_orchestrator.py`) :**
   ```bash
   python tests/test_agent.py task2
   ```

4. **Déployer l'AgentCore Runtime & Créer le Guardrail (Task 3) :**
   ```bash
   python src/agent_orchestrator.py deploy
   ```

5. **Tester la Mémoire (Task 4) et les Knowledge Bases (Task 5) :**
   ```bash
   python tests/test_agent.py task4
   python tests/test_agent.py task5
   ```

6. **Tester l'Observabilité (Task 6) et Lancer la Suite Complète (Score 120/120) :**
   ```bash
   python tests/test_agent.py task6
   python tests/test_agent.py all
   ```

7. **Lancer le Test Live End-to-End pour générer le Service Map X-Ray :**
   ```bash
   python src/agent_orchestrator.py test
   ```
