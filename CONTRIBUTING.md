# Contributing

## Submitting a pull request

* Fork and clone the repository
* Install PNPM
* Configure and install dependencies: `make install`
* Create a new branch:
    * `git checkout -b feat/my-feature`
    * `git checkout -b fix/my-fix`
* Make your change, add tests, and make sure `make test` still passes.
* Make sure your code is correctly formatted: `make lint`
* Build the project: `make build`
* Push to your fork and submit a pull request
* Wait for your pull request to be reviewed and merged

Here are a few things you can do that will increase the likelihood of your pull request being accepted:

- Write tests.
- Keep your change as focused as possible. If there are multiple changes you would like to make that are not dependent
  upon each other, consider submitting them as separate pull requests.
- Adding a new package manager? Add one plugin module under `src/core/plugins/<ecosystem>/` and
  register it in `src/core/plugins/all-plugins.ts`. Nothing else in the pipeline should need to
  change. See [`_docs/supported-package-managers.md`](_docs/supported-package-managers.md) for
  what a plugin is expected to do.

## Resources

- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
- [Using Pull Requests](https://help.github.com/articles/about-pull-requests/)
- [Writing good commit messages](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html)

Thanks! :heart: :heart: :heart:

Code owners:
- [Pooyan Razian](https://pooyan.info)
- [Yanovian](https://yanovian.com)
