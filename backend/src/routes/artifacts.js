'use strict';

const express = require('express');
const PDFDocument = require('pdfkit');
const storage = require('../storage');

const router = express.Router();

// GET /api/artifacts
router.get('/', (req, res) => {
  const { executionId, agentId } = req.query;
  let artifacts = storage.findAll('artifacts');

  if (executionId) artifacts = artifacts.filter((a) => a.executionId === executionId);
  if (agentId) artifacts = artifacts.filter((a) => a.agentId === agentId);

  artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ artifacts, total: artifacts.length });
});

// GET /api/artifacts/:id
router.get('/:id', (req, res) => {
  const artifact = storage.findById('artifacts', req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artefact introuvable' });
  res.json(artifact);
});

// GET /api/artifacts/:id/download – return raw content
router.get('/:id/download', (req, res) => {
  const artifact = storage.findById('artifacts', req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artefact introuvable' });

  const filename = `${artifact.agentId}_${artifact.id.substring(0, 8)}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(artifact.content);
});

// GET /api/artifacts/:id/export-pdf
router.get('/:id/export-pdf', (req, res) => {
  const artifact = storage.findById('artifacts', req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artefact introuvable' });

  const filename = `${artifact.agentId}_${artifact.id.substring(0, 8)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(res);

  // Title
  doc.fontSize(18).font('Helvetica-Bold').text(artifact.agentName, { align: 'left' });
  doc.fontSize(10).font('Helvetica').fillColor('#888888')
    .text(`Généré le ${new Date(artifact.createdAt).toLocaleString('fr-FR')}`, { align: 'left' });
  doc.moveDown(1.5);

  // Content — strip markdown syntax for clean PDF text
  const plain = artifact.content
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/, '').replace(/```/, ''))
    .replace(/#{1,6} /g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*] /gm, '• ');

  doc.fontSize(11).font('Helvetica').fillColor('#1a1a2e').text(plain, { lineGap: 4 });
  doc.end();
});

// DELETE /api/artifacts/:id
router.delete('/:id', (req, res) => {
  const ok = storage.remove('artifacts', req.params.id);
  if (!ok) return res.status(404).json({ error: 'Artefact introuvable' });
  res.json({ message: 'Artefact supprimé' });
});

module.exports = router;
