import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeKnowledgebase } from './build';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
writeKnowledgebase(publicDir);
