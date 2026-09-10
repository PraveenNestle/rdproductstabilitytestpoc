#!/usr/bin/env node
// Seed reference and configuration JSON blobs. Real observations are created by the capture API.
import { readFileSync } from 'node:fs';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

const account = process.env.STORAGE_ACCOUNT_NAME;
if (!account) throw new Error('STORAGE_ACCOUNT_NAME is required');
const service = process.env.STORAGE_CONNECTION_STRING
  ? BlobServiceClient.fromConnectionString(process.env.STORAGE_CONNECTION_STRING)
  : new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential());
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const demo = json('../src/data/demo_dataset.json');
const catalog = json('../src/data/catalog.json');
const reference = service.getContainerClient(process.env.CONTAINER_REFERENCE || 'reference');
const config = service.getContainerClient(process.env.CONTAINER_CONFIG || 'config');
await reference.createIfNotExists();
await config.createIfNotExists();

const entities = { projects: demo.projects, ars: demo.ars, trials: demo.trials, variants: demo.variants, samples: demo.samples, plans: demo.plans, users: demo.users };
const upload = async (container, name, value, metadata = {}) => {
  const body = JSON.stringify(value);
  await container.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), { blobHTTPHeaders: { blobContentType: 'application/json' }, metadata });
};
for (const [name, value] of Object.entries(entities)) await upload(reference, `${name}.json`, value, { entity: name, source: 'DEMO_SEED' });
await upload(reference, '_manifest.json', { source: 'DEMO_SEED', updatedAt: new Date().toISOString(), updatedBy: 'bootstrap_blob.mjs', entities: Object.fromEntries(Object.entries(entities).map(([name, value]) => [name, { count: value.length, blob: `reference/${name}.json` }])) });
await upload(config, 'vocabularies.json', catalog.vocabularies, { source: 'DEMO_SEED' });
for (const template of catalog.templates) await upload(config, `templates/${template.templateId}/v${template.version}.json`, { ...template, createdBy: 'SEED', createdAt: catalog.generatedAt }, { source: 'DEMO_SEED' });
console.log(`Seeded ${Object.keys(entities).length} reference JSON files, manifest, vocabularies, and ${catalog.templates.length} templates into ${account}.`);