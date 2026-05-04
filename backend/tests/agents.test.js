'use strict';

const { getAllAgents, getAgentById, getAgentsByCategory } = require('../src/agents/registry');

describe('Agent Registry', () => {
  test('getAllAgents returns exactly 10 agents', () => {
    const agents = getAllAgents();
    expect(agents).toHaveLength(10);
  });

  test('each agent has required fields', () => {
    const agents = getAllAgents();
    const required = ['id', 'name', 'emoji', 'category', 'description', 'capabilities', 'systemPrompt'];
    for (const agent of agents) {
      for (const field of required) {
        expect(agent).toHaveProperty(field);
        expect(agent[field]).toBeTruthy();
      }
    }
  });

  test('each agent has at least 3 capabilities', () => {
    const agents = getAllAgents();
    for (const agent of agents) {
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(agent.capabilities.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('agent IDs are unique', () => {
    const agents = getAllAgents();
    const ids = agents.map((a) => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('getAgentById returns correct agent', () => {
    const agent = getAgentById('sim-fdtd');
    expect(agent).toBeTruthy();
    expect(agent.id).toBe('sim-fdtd');
    expect(agent.emoji).toBe('🔬');
  });

  test('getAgentById returns null for unknown id', () => {
    expect(getAgentById('does-not-exist')).toBeNull();
  });

  test('getAgentsByCategory filters correctly', () => {
    const devAgents = getAgentsByCategory('Development');
    expect(devAgents.length).toBeGreaterThan(0);
    devAgents.forEach((a) => expect(a.category).toBe('Development'));
  });

  test('all agents have valid categories', () => {
    const agents = getAllAgents();
    for (const agent of agents) {
      expect(typeof agent.category).toBe('string');
      expect(agent.category.length).toBeGreaterThan(0);
    }
  });

  test('agent inputSchema is an object', () => {
    const agents = getAllAgents();
    for (const agent of agents) {
      expect(agent.inputSchema).toBeDefined();
      expect(typeof agent.inputSchema).toBe('object');
    }
  });

  test('agent outputFormats is non-empty array', () => {
    const agents = getAllAgents();
    for (const agent of agents) {
      expect(Array.isArray(agent.outputFormats)).toBe(true);
      expect(agent.outputFormats.length).toBeGreaterThan(0);
    }
  });
});
