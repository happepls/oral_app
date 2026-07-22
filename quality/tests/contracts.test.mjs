import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';

const openapi = fs.readFileSync('contracts/openapi-v1.yaml', 'utf8');
const asyncapi = fs.readFileSync('contracts/asyncapi-v1.yaml', 'utf8');
const appSource = fs.readFileSync('services/developer-api-service/src/app.js', 'utf8');
const document = parse(openapi);
const compatibility = JSON.parse(fs.readFileSync('contracts/openapi-v1.compatibility.json', 'utf8'));

test('OpenAPI 3.1 declares the stable auth and envelope contract', () => {
  assert.match(openapi, /^openapi: 3\.1\.0/m);
  assert.match(openapi, /name: X-Guaji-API-Key/);
  assert.match(openapi, /DelegatedBearer/);
  assert.match(openapi, /required: \[request_id\]/);
  assert.doesNotMatch(openapi, /^ {2}\/(?:stripe|webhook|reset-phase|confirm-complete)/im);
});

test('every implemented REST path is present in OpenAPI', () => {
  for (const route of ['/oauth/token', '/profile', '/goals', '/tasks', '/conversations', '/conversations/{sessionId}', '/ai/scenarios', '/ai/tts', '/realtime/tickets']) assert.ok(openapi.includes(`  ${route}:`), route);
  assert.match(appSource, /req\.delegated\.user_id/);
  assert.doesNotMatch(appSource, /req\.body\?\.userId|req\.query\.userId/);
});

test('AsyncAPI 3 describes binary audio and server event schemas', () => {
  assert.match(asyncapi, /^asyncapi: 3\.0\.0/m);
  assert.match(asyncapi, /contentEncoding: binary/);
  assert.match(asyncapi, /proficiency_update/);
  assert.match(asyncapi, /task_completed/);
});

test('OpenAPI parses and all local references resolve', () => {
  const refs = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') refs.push(value.$ref);
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  for (const ref of refs) {
    assert.match(ref, /^#\//, `external ref is not allowed: ${ref}`);
    const target = ref.slice(2).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document);
    assert.ok(target, `unresolved ref: ${ref}`);
  }
});

test('compatibility baseline prevents public operation and security removal', () => {
  const operations = new Set();
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) if (pathItem[method]) operations.add(`${method.toUpperCase()} ${route}`);
  }
  for (const operation of compatibility.operations) assert.ok(operations.has(operation), `breaking removal: ${operation}`);
  for (const scheme of compatibility.required_security_schemes) assert.ok(document.components.securitySchemes[scheme], `missing security scheme: ${scheme}`);
  for (const operation of compatibility.idempotent_operations) {
    const [method, route] = operation.split(' ');
    const parameters = document.paths[route][method.toLowerCase()].parameters || [];
    assert.ok(parameters.some((parameter) => parameter.$ref === '#/components/parameters/IdempotencyKey'), `${operation} must require Idempotency-Key`);
  }
});

test('all public operations declare standard errors and never accept userId', () => {
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
      const operation = pathItem[method];
      if (!operation) continue;
      assert.ok(operation.responses?.default || operation.responses?.['4XX'], `${method.toUpperCase()} ${route} lacks a standard error response`);
      assert.doesNotMatch(JSON.stringify(operation.requestBody || {}), /user_?id/i, `${method.toUpperCase()} ${route} exposes userId`);
    }
  }
});
