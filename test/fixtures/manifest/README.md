<!-- Copyright 2026 Ayush Kumar Shaw -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Manifest fixtures

`v1.json` and `v2.json` are manifests in the exact bytes `serializeManifest` writes. `test/manifest.test.ts` checks that a no-op run keeps `v1.json` byte-identical and that both validate against `skills/cutwater/assets/manifest.schema.json`. Do not reformat them.
