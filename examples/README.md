# 📚 Format Markdown et Exemples

Ce dossier contient des fichiers exemples complets pour le Markdown Task Manager, ainsi que la documentation détaillée du format Markdown utilisé.

## 📁 Fichiers d'exemple

```
examples/
├── kanban.md      # Fichier principal avec config et tâches actives
├── archive.md     # Archives des tâches terminées
└── README.md      # Ce fichier (documentation du format)
```

## 🎯 Vue d'ensemble

Le Markdown Task Manager utilise **deux fichiers Markdown** pour organiser vos tâches :

| Fichier | Rôle | Chargement |
|---------|------|------------|
| `kanban.md` | Configuration + Tâches actives | Au démarrage |
| `archive.md` | Tâches archivées | À la demande |

---

## 📄 Structure de `kanban.md`

### 1. Commentaire de configuration (obligatoire)

```markdown
# Kanban Board

<!-- Config: Last Task ID: 42 -->
```

- **Obligatoire** : Compteur d'ID auto-incrémenté
- L'application lit ce nombre pour générer le prochain ID de tâche
- Modifié automatiquement par l'application

### 2. Section Configuration (obligatoire)

```markdown
## ⚙️ Configuration

**Colonnes**: 📝 À faire (todo) | 🚀 En cours (in-progress) | 👀 En revue (in-review) | ✅ Terminé (done)

**Catégories**: Frontend, Backend, Design, DevOps, Tests, Documentation

**Utilisateurs**: @alice (Alice Martin), @bob (Bob Dupont), @charlie (Charlie Dubois)

**Priorités**: 🔴 Critique | 🟠 Haute | 🟡 Moyenne | 🟢 Basse

**Tags**: #bug #feature #ui #backend #urgent #refactor #docs #test #performance

---
```

#### Format des colonnes

```
{Emoji} {Nom affiché} ({id-unique})
```

- **Emoji** : Optionnel mais recommandé pour l'interface
- **Nom affiché** : Texte visible dans le Kanban
- **ID unique** : Identifiant interne (lettres, chiffres, tirets)

**Exemples** :
```markdown
📝 À faire (todo)
🚀 En cours (in-progress)
✅ Terminé (done)
```

#### Format des catégories

Liste séparée par des virgules :
```markdown
**Catégories**: Frontend, Backend, Design
```

#### Format des utilisateurs

```
@username (Nom Complet), @autre (Autre Nom)
```

- **@username** : Identifiant court pour mention
- **Nom Complet** : Nom complet entre parenthèses

#### Format des priorités

```
{Emoji} {Nom} | {Emoji} {Nom} | ...
```

Les 4 priorités standard :
```markdown
🔴 Critique | 🟠 Haute | 🟡 Moyenne | 🟢 Basse
```

#### Format des tags

Liste de tags séparés par des espaces :
```markdown
**Tags**: #bug #feature #ui #backend
```

### 3. Sections de colonnes

Chaque colonne Kanban a sa propre section :

```markdown
## 📝 À faire

{Tâches de cette colonne...}

## 🚀 En cours

{Tâches de cette colonne...}

## ✅ Terminé

{Tâches de cette colonne...}
```

**Important** :
- Le titre de la section doit correspondre au nom défini dans la configuration
- L'ordre des sections définit l'ordre d'affichage dans le Kanban

---

## 📝 Format d'une tâche

### Structure complète

```markdown
### TASK-001 | Titre de ma tâche

**Priorité**: Haute | **Catégorie**: Frontend | **Assigné**: @alice, @bob
**Créé**: 2025-01-20 | **Échéance**: 2025-02-15
**Tags**: #feature #ui

Description détaillée de la tâche en Markdown.

Vous pouvez utiliser **tout le Markdown standard** :
- Listes
- **Gras** et *italique*
- `Code inline`
- [Liens](https://example.com)

**Sous-tâches**:
- [ ] Première étape à faire
- [x] Étape terminée
- [ ] Dernière étape

**Notes**:
Notes additionnelles ou contexte...

---
```

### Champs obligatoires

| Champ | Format | Description |
|-------|--------|-------------|
| **ID** | `TASK-XXX` | Numéro unique auto-incrémenté |
| **Titre** | Texte après `\|` | Titre court de la tâche |
| **Priorité** | Critique\|Haute\|Moyenne\|Basse | Niveau de priorité |
| **Catégorie** | Texte libre | Catégorie/projet |
| **Créé** | YYYY-MM-DD | Date de création |

### Champs optionnels

| Champ | Format | Description |
|-------|--------|-------------|
| **Assigné** | `@user1, @user2` | Utilisateurs assignés (séparés par virgules) |
| **Commencé** | YYYY-MM-DD | Date de début effectif |
| **Échéance** | YYYY-MM-DD | Date limite |
| **Terminé** | YYYY-MM-DD | Date de complétion |
| **Tags** | `#tag1 #tag2` | Tags (avec #, séparés par espaces) |
| **Sous-tâches** | `- [ ]` ou `- [x]` | Checklist Markdown |
| **Notes** | Texte libre | Notes additionnelles |

### Métadonnées inline (ligne Priorité)

```markdown
**Priorité**: Haute | **Catégorie**: Backend | **Assigné**: @alice, @bob
```

- Séparées par ` | ` (pipe entouré d'espaces)
- Ordre flexible
- Les champs manquants sont omis

### Dates (ligne Créé)

```markdown
**Créé**: 2025-01-20 | **Commencé**: 2025-01-22 | **Échéance**: 2025-02-15
```

- Format **obligatoire** : `YYYY-MM-DD` (ISO 8601)
- Séparées par ` | `
- Seul `**Créé**` est obligatoire

### Tags

```markdown
**Tags**: #bug #urgent #frontend
```

- Commencent par `#`
- Séparés par des espaces
- Pas de virgules

### Sous-tâches

```markdown
**Sous-tâches**:
- [ ] Tâche non commencée
- [x] Tâche terminée
- [ ] Autre tâche
```

- Format standard Markdown checkbox
- `[ ]` = non fait
- `[x]` = fait
- L'application calcule automatiquement la progression

### Séparateur de fin

```markdown
---
```

- **Obligatoire** entre chaque tâche
- Trois tirets sur une ligne seule
- Permet au parser de délimiter les tâches

---

## 🗄️ Structure de `archive.md`

```markdown
# Archive des Tâches

> Ce fichier contient toutes les tâches terminées et archivées.

## ✅ Janvier 2025

### TASK-098 | Tâche archivée

**Priorité**: Haute | **Catégorie**: Frontend | **Assigné**: @alice
**Créé**: 2024-12-20 | **Commencé**: 2024-12-28 | **Terminé**: 2025-01-05
**Tags**: #feature #ui

Description de la tâche...

**Résultat**:
La tâche a été complétée avec succès.

---

### TASK-097 | Autre tâche archivée

...

---

## ✅ Décembre 2024

### TASK-090 | Tâche plus ancienne

...
```

### Organisation chronologique

- **Sections par mois** : `## ✅ Janvier 2025`
- **Plus récent en haut** : Les nouveaux mois sont ajoutés en haut
- **Tâches par mois** : Triées par date de fin décroissante

### Différences avec kanban.md

1. **Pas de section Configuration** : Non nécessaire
2. **Sections par date** : Plutôt que par colonne
3. **Champ Terminé obligatoire** : Date de fin de la tâche
4. **Chargement différé** : Fichier non lu au démarrage

---

## 🔧 Édition manuelle

### Créer une nouvelle tâche

1. Ouvrir `kanban.md` dans votre éditeur
2. Trouver le commentaire `<!-- Config: Last Task ID: X -->`
3. Noter le numéro (ex: 42)
4. Aller dans la section de colonne appropriée (ex: `## 📝 À faire`)
5. Copier ce template :

```markdown
### TASK-043 | Mon nouveau titre

**Priorité**: Moyenne | **Catégorie**: Backend | **Assigné**: @alice
**Créé**: 2025-01-20 | **Échéance**: 2025-02-01
**Tags**: #feature

Description de ma nouvelle tâche...

**Sous-tâches**:
- [ ] Étape 1
- [ ] Étape 2

---
```

6. Incrémenter le compteur dans le commentaire : `<!-- Config: Last Task ID: 43 -->`
7. Sauvegarder

### Déplacer une tâche entre colonnes

1. Couper toute la section (de `###` jusqu'au `---` inclus)
2. Coller dans une autre section de colonne
3. Optionnel : Ajouter `**Commencé**` si vous passez en "En cours"
4. Sauvegarder

### Archiver une tâche

1. Couper la tâche complète de `kanban.md`
2. Ouvrir `archive.md`
3. Trouver ou créer la section du mois (ex: `## ✅ Janvier 2025`)
4. Coller la tâche
5. Ajouter le champ `**Terminé**: 2025-01-20` dans la ligne des dates
6. Sauvegarder les deux fichiers

### Marquer une sous-tâche terminée

Remplacer `[ ]` par `[x]` :

```markdown
**Sous-tâches**:
- [x] Étape terminée
- [ ] Étape en cours
```

---

## 🎨 Personnalisation

### Colonnes personnalisées

Vous pouvez créer vos propres colonnes :

```markdown
**Colonnes**: 📋 Backlog (backlog) | 📝 À faire (todo) | 🏗️ Dev (dev) | 🧪 Test (test) | ✅ Prod (prod)
```

Puis créez les sections correspondantes :

```markdown
## 📋 Backlog

...

## 📝 À faire

...
```

### Catégories personnalisées

Adaptez les catégories à votre projet :

```markdown
**Catégories**: Interface, API, Base de données, Sécurité, Documentation, Infrastructure
```

### Tags personnalisés

Créez vos propres conventions de tags :

```markdown
**Tags**: #p0 #p1 #p2 #sprint-5 #customer-request #tech-debt #security
```

---

## 📊 Exemples complets

### Tâche simple

```markdown
### TASK-001 | Corriger le bug de connexion

**Priorité**: Critique | **Catégorie**: Backend | **Assigné**: @bob
**Créé**: 2025-01-20 | **Échéance**: 2025-01-21
**Tags**: #bug #urgent

Les utilisateurs ne peuvent pas se connecter depuis ce matin.

---
```

### Tâche avec sous-tâches

```markdown
### TASK-002 | Implémenter l'authentification OAuth

**Priorité**: Haute | **Catégorie**: Backend | **Assigné**: @alice, @bob
**Créé**: 2025-01-15 | **Commencé**: 2025-01-18 | **Échéance**: 2025-02-01
**Tags**: #feature #security

Ajouter le support OAuth 2.0 pour Google et GitHub.

**Sous-tâches**:
- [x] Recherche des librairies
- [x] Setup passport.js
- [ ] Implémenter Google OAuth
- [ ] Implémenter GitHub OAuth
- [ ] Tests d'intégration
- [ ] Documentation

**Notes**:
Utiliser passport-google-oauth20 et passport-github2

---
```

### Tâche archivée

```markdown
### TASK-050 | Migration vers PostgreSQL

**Priorité**: Haute | **Catégorie**: Infrastructure | **Assigné**: @charlie
**Créé**: 2024-12-01 | **Commencé**: 2024-12-05 | **Terminé**: 2024-12-20
**Tags**: #database #migration

Migration complète de MySQL vers PostgreSQL 14.

**Résultat**:
- Migration réussie sans perte de données
- Performance améliorée de 40%
- Tous les tests passent

---
```

---

## 🔍 Parser le format (pour développeurs)

### Extraire la configuration

```javascript
// Last Task ID
const idMatch = content.match(/<!-- Config: Last Task ID: (\d+) -->/);
const lastTaskId = idMatch ? parseInt(idMatch[1]) : 0;

// Colonnes
const colMatch = content.match(/\*\*Colonnes\*\*:\s*(.+)/);
const columns = colMatch[1].split('|').map(col => {
    const match = col.trim().match(/(.+?)\s*\(([^)]+)\)/);
    return {
        name: match ? match[1].trim() : col.trim(),
        id: match ? match[2].trim() : col.trim().toLowerCase()
    };
});

// Catégories
const catMatch = content.match(/\*\*Catégories\*\*:\s*(.+)/);
const categories = catMatch ? catMatch[1].split(',').map(c => c.trim()) : [];

// Utilisateurs
const userMatch = content.match(/\*\*Utilisateurs\*\*:\s*(.+)/);
const users = userMatch[1].split(',').map(u => {
    const match = u.trim().match(/@(\w+)\s*\(([^)]+)\)/);
    return match ? { id: match[1], name: match[2] } : { id: u.trim(), name: u.trim() };
});
```

### Extraire les tâches

```javascript
// Split par sections de colonnes
const sections = content.split(/^## /m).slice(1);

// Pour chaque section
sections.forEach(section => {
    const [header, ...taskLines] = section.split('\n');
    const columnMatch = header.match(/[📝🚀👀✅]\s*(.+)/);
    const columnName = columnMatch ? columnMatch[1].trim() : header.trim();

    // Split par tâches
    const taskContent = taskLines.join('\n');
    const tasks = taskContent.split(/^### TASK-/m).slice(1);

    tasks.forEach(taskText => {
        const task = parseTask('TASK-' + taskText);
        // ...
    });
});
```

### Parser une tâche

```javascript
function parseTask(content) {
    // ID et titre
    const titleMatch = content.match(/^(\d+)\s*\|\s*(.+)/m);
    const id = 'TASK-' + titleMatch[1];
    const title = titleMatch[2].trim();

    // Priorité, catégorie, assignés
    const metaMatch = content.match(/\*\*Priorité\*\*:\s*(\w+)(?:\s*\|\s*\*\*Catégorie\*\*:\s*([^|]+))?(?:\s*\|\s*\*\*Assigné\*\*:\s*([^\n]+))?/);
    const priority = metaMatch[1];
    const category = metaMatch[2] ? metaMatch[2].trim() : '';
    const assignees = metaMatch[3] ? metaMatch[3].split(',').map(a => a.trim()) : [];

    // Dates
    const dateMatch = content.match(/\*\*Créé\*\*:\s*(\d{4}-\d{2}-\d{2})(?:\s*\|\s*\*\*Commencé\*\*:\s*(\d{4}-\d{2}-\d{2}))?(?:\s*\|\s*\*\*Échéance\*\*:\s*(\d{4}-\d{2}-\d{2}))?/);
    const created = dateMatch[1];
    const started = dateMatch[2] || null;
    const due = dateMatch[3] || null;

    // Tags
    const tagsMatch = content.match(/\*\*Tags\*\*:\s*(.+)/);
    const tags = tagsMatch ? tagsMatch[1].split(/\s+/).map(t => t.replace('#', '')) : [];

    // Description
    const descMatch = content.match(/\*\*Tags\*\*:.*?\n\n([\s\S]*?)(?:\n\*\*|---)/);
    const description = descMatch ? descMatch[1].trim() : '';

    // Sous-tâches
    const subtasks = [];
    const subtaskMatches = content.matchAll(/- \[([ x])\] (.+)/g);
    for (const match of subtaskMatches) {
        subtasks.push({ completed: match[1] === 'x', text: match[2] });
    }

    return { id, title, priority, category, assignees, created, started, due, tags, description, subtasks };
}
```

---

## ⚡ Performance

### Recommandations

| Fichier | Taille max | Tâches max | Parsing |
|---------|-----------|------------|---------|
| kanban.md | 500 KB | 1000 | < 100ms |
| archive.md | Illimité | Illimité | Lazy load |

### Optimisations

- **Archivage régulier** : Déplacez les vieilles tâches vers archive.md
- **Sections courtes** : Pas plus de 200-300 tâches par colonne
- **Cache** : L'application garde les tâches en mémoire
- **Lazy loading** : archive.md n'est chargé qu'à la demande

---

## ✅ Validation du format

### Checklist

- [ ] Commentaire `<!-- Config: Last Task ID: X -->` présent
- [ ] Section `## ⚙️ Configuration` avec toutes les colonnes
- [ ] Chaque colonne a sa section `## {Nom Colonne}`
- [ ] Chaque tâche commence par `### TASK-{num} |`
- [ ] Toutes les tâches ont Priorité, Catégorie, Créé
- [ ] Dates au format YYYY-MM-DD
- [ ] Séparateur `---` après chaque tâche
- [ ] Pas d'ID dupliqué

---

## 💡 Conseils et bonnes pratiques

1. **IDs séquentiels** : Ne sautez jamais de numéro, n'en réutilisez jamais
2. **Dates ISO** : Toujours YYYY-MM-DD pour la cohérence
3. **Archivage régulier** : Au moins une fois par mois
4. **Git-friendly** : Committez après chaque batch de modifications
5. **Catégories cohérentes** : Définissez-les dans la config d'abord
6. **Tags normalisés** : Créez une convention pour votre équipe
7. **Backup** : Vos fichiers MD sont précieux, sauvegardez-les

---

**Version du format** : 1.0
**Dernière mise à jour** : 2025-11-08
