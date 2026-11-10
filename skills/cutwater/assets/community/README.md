# {{projectName}}

{{description}}

## Getting started

```sh
git clone https://github.com/{{repo}}.git
cd {{repoName}}
{{installCommand}}
```

Run the checks:

```sh
{{testCommand}}
```

## How work happens here

Every change starts as an issue, is built on its own branch, uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), and lands through a pull request that a maintainer reviews and merges. See [CONTRIBUTING.md](CONTRIBUTING.md) for the details.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. Report security problems privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## License

{{#if hasLicense}}
Distributed under the {{licenseName}} license. See [LICENSE](LICENSE) for details.
{{/if}}
{{#unless hasLicense}}
No license has been chosen yet, so default copyright law applies: you may view the code, but not reuse it without permission.
{{/unless}}
