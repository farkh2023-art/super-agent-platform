'use strict';

process.env.AI_PROVIDER = 'mock';
process.env.DATA_DIR = './data-test';

const { selectAgentsForTask } = require('../src/engine/planner');

describe('Task Planner', () => {
  test('selectAgentsForTask selects agents for FDTD task', () => {
    const agents = selectAgentsForTask('Créer une simulation FDTD pour des nanoparticules d\'or');
    expect(agents.length).toBeGreaterThan(0);
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('sim-fdtd');
  });

  test('selectAgentsForTask selects agents for SQL task', () => {
    const agents = selectAgentsForTask('Analyse la lignée de données SQL de notre base de données');
    expect(agents.length).toBeGreaterThan(0);
    const ids = agents.map((a) => a.id);
    expect(ids.some((id) => id.includes('data-lineage'))).toBe(true);
  });

  test('selectAgentsForTask selects agents for shell task', () => {
    const agents = selectAgentsForTask('Écris un script bash pour automatiser le déploiement');
    expect(agents.length).toBeGreaterThan(0);
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('shell-specialist');
  });

  test('selectAgentsForTask returns default agents for generic task', () => {
    const agents = selectAgentsForTask('Fais quelque chose de général');
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.length).toBeLessThanOrEqual(4);
  });

  test('selectAgentsForTask returns at most 4 agents', () => {
    const agents = selectAgentsForTask(
      'simulation FDTD sql backlog kanban shell bash deploy npm audit twitter tweet'
    );
    expect(agents.length).toBeLessThanOrEqual(4);
  });

  test('selectAgentsForTask selects backlog agent for project tasks', () => {
    const agents = selectAgentsForTask('Génère un backlog Agile sprint kanban pour mon projet');
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('backlog-forge');
  });

  test('selectAgentsForTask selects x-scraper for twitter tasks', () => {
    const agents = selectAgentsForTask('Scrape les tweets Twitter avec l\'API X');
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('x-scraper');
  });

  test('selectAgentsForTask selects devops-deps for npm tasks', () => {
    const agents = selectAgentsForTask('Audite les dépendances npm et résous les CVE');
    const ids = agents.map((a) => a.id);
    expect(ids).toContain('devops-deps');
  });
});
