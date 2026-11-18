#!/usr/bin/env python3
"""Validate the published Fusion 3D task graph and per-task contracts.

This checks planning structure. It does not certify game implementation, source
fidelity, visual quality, rights or deployment success.
"""
import argparse
import json
import re
from collections import Counter, defaultdict, deque
from pathlib import Path


def validate(root: Path):
    errors = []
    data = json.loads((root / 'tasks.json').read_text())
    tasks = data['tasks']
    counts = Counter(t.get('id') for t in tasks)
    errors.extend(f'Duplicate task ID: {k}' for k, v in counts.items() if v > 1)
    by_id = {t['id']: t for t in tasks}
    required = ['id', 'title', 'owner', 'workstream', 'phase', 'kind', 'scope',
                'depends_on', 'context_files', 'non_goals', 'steps', 'deliverables',
                'acceptance', 'guardrails', 'handoff']
    external = set(data.get('existing_issue_ids', []))
    out = defaultdict(list)
    indegree = dict.fromkeys(by_id, 0)
    for t in tasks:
        ident = t['id']
        for f in required:
            if f not in t or t[f] is None or (f != 'depends_on' and t[f] == ''):
                errors.append(f'{ident}: missing {f}')
        if not re.fullmatch(r'(OPS|INT|ENG|RES|ART|WORLD|UX|PKG)-\d{3}', ident):
            errors.append(f'Invalid initial task ID: {ident}')
        if not isinstance(t.get('phase'), int) or not 0 <= t['phase'] <= 8:
            errors.append(f'{ident}: phase is not G0..G8')
        for f, n in [('steps', 4), ('acceptance', 3), ('deliverables', 2), ('guardrails', 2)]:
            if not isinstance(t.get(f), list) or len(t[f]) < n:
                errors.append(f'{ident}: insufficient explicit {f}')
        if len(t.get('depends_on', [])) != len(set(t.get('depends_on', []))):
            errors.append(f'{ident}: repeated dependency')
        for dep in t.get('depends_on', []):
            if dep == ident:
                errors.append(f'{ident}: self-dependency')
            if dep in by_id:
                out[dep].append(ident)
                indegree[ident] += 1
            elif dep not in external:
                errors.append(f'{ident}: unresolved dependency {dep}')
        for related in t.get('existing_issues', []):
            if related not in external:
                errors.append(f'{ident}: unknown existing issue {related}')
        if t.get('required_external_gates'):
            errors.append(f'{ident}: external task gates have not been reconciled into named dependencies')
        for text in t.get('steps', []) + t.get('acceptance', []) + [t.get('handoff', '')]:
            if 'Ready for Review' in text:
                errors.append(f'{ident}: nonexistent native review-state wording')
        task_path = root / 'tasks' / f'{ident}.md'
        if not task_path.is_file():
            errors.append(f'{ident}: missing complete Markdown packet')
    ready = deque(sorted(k for k, v in indegree.items() if v == 0))
    order = []
    while ready:
        ident = ready.popleft()
        order.append(ident)
        for child in sorted(out[ident]):
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
    if len(order) != len(tasks):
        errors.append('Dependency cycle: ' + ', '.join(k for k, v in indegree.items() if v))
    # Final qualification must retain all era gates and every other task as an
    # ancestor of programme completion (directly or through closure tasks).
    if 'INT-005' in by_id and 'INT-006' in by_id:
        seen = set()
        def walk(ident):
            if ident in seen:
                return
            seen.add(ident)
            for dep in by_id[ident]['depends_on']:
                if dep in by_id:
                    walk(dep)
        walk('INT-005')
        if 'INT-006' not in seen:
            errors.append('INT-005 can close before required documentation INT-006')
        allowed = set(data.get('nonblocking_reference_tasks', []))
        missing = set(by_id) - seen - allowed
        if missing:
            errors.append('Mandatory tasks absent from final completion ancestry: ' + ', '.join(sorted(missing)))
    pub_path = root / 'linear-publication.json'
    published = 0
    if pub_path.exists():
        publication = json.loads(pub_path.read_text())
        published_map = {x['plan_id']: x for x in publication.get('issues', [])}
        if published_map:
            if set(published_map) != set(by_id):
                errors.append('Published Linear issue map differs from full initial task set')
            identifiers = [x.get('id') for x in published_map.values()]
            if len(set(identifiers)) != len(identifiers):
                errors.append('Multiple task IDs map to one Linear issue')
            for ident, entry in published_map.items():
                if not re.fullmatch(r'THU-\d+', entry.get('id', '')):
                    errors.append(f'{ident}: invalid published issue identifier')
                if not entry.get('url', '').startswith('https://linear.app/'):
                    errors.append(f'{ident}: missing real Linear URL')
                if ident in by_id:
                    expected_deps = by_id[ident]['depends_on']
                    if set(entry.get('depends_on', [])) != set(expected_deps):
                        errors.append(f'{ident}: published plan dependencies differ')
                    expected_native = {published_map[d]['id'] for d in expected_deps if d in published_map}
                    if set(entry.get('blocked_by', [])) != expected_native:
                        errors.append(f'{ident}: published native blockers differ')
            published = len(published_map)
    report = dict(status='PASS' if not errors else 'FAIL', task_count=len(tasks),
                  phase_counts=dict(sorted(Counter(t.get('phase') for t in tasks).items())),
                  workstream_counts=dict(Counter(t.get('workstream') for t in tasks)),
                  kind_counts=dict(Counter(t.get('kind') for t in tasks)),
                  published_task_count=published, topological_order=order, errors=errors,
                  scope='Planning structure only; no game/runtime qualification is implied.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).parent)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = validate(args.root)
    if args.output:
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'topological_order'}, indent=2))
    raise SystemExit(bool(result['errors']))
