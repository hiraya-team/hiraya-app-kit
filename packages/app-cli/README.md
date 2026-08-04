# `@hiraya/app-cli`

Create and securely package Hiraya apps and themes.

```sh
bunx @hiraya/app-cli init my-app com.example.my-app
bunx @hiraya/app-cli package my-app/dist my-app.hiraya.app
bunx @hiraya/app-cli validate my-app.hiraya.app
```

The package root exports the environment-neutral archive inspection API and does not load filesystem modules. The executable adds local directory, template, and output handling.
