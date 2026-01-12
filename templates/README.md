# Kanban Templates

Ready-to-use kanban.md templates for different project types.

## Available Templates

### minimal.md
Simple 3-column Kanban for personal projects.

**Columns:** To Do | In Progress | Done

**Best for:**
- Personal task management
- Side projects
- Quick prototypes

### monorepo.md
Multi-service template for monorepo projects.

**Columns:** To Do | In Progress | Review | Done

**Categories:** Infrastructure, DevOps, Documentation, Security, CI/CD

**Best for:**
- Microservices architecture
- Multi-team projects
- Platform/DevOps teams

## Usage

```bash
# Copy template to your project
cp templates/kanban/minimal.md your-project/kanban.md

# Or for monorepo global tasks
cp templates/kanban/monorepo.md monorepo/docs/todo/kanban.md
```

## Customization

All templates can be customized by editing:
- **Columns:** Change names and order
- **Categories:** Add project-specific categories
- **Users:** Add team members
- **Tags:** Define your tag system
- **Priorities:** Customize priority levels

See [main README](../README.md) for customization examples.
