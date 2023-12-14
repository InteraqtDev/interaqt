<p align="center">
  <img src="../../logo.svg" />
</p>
<p align="center">
<img src="https://img.shields.io/npm/v/%40interaqt%2Fruntime" />
<img src="https://img.shields.io/npm/dt/%40interaqt/runtime" />
</p>

# Quick Start

## What is @interaqt/runtime

@interaqt/runtime is a brand-new application framework. For better understanding, it can be considered as an alternative to a Web Framework + ORM/CMS + BPM Engine.

## Why create @interaqt/runtime

@interaqt/runtime implements a simpler yet more challenging paradigm:

```
data = computation(events)
```

With this paradigm, we consistently describe what the data in the system is, and with a single line of code manipulating data, a complete application can be implemented. The intuitive features include:
- Almost achieving the implementation of software once the requirements are modeled.
- No manually written code for data changes, thus eliminating bugs due to human error.

More importantly, the reason for creating @interaqt/runtime is:
- After modeling requirements, its code and software architecture can begin to be automatically generated, no longer relying on human experience.
- Requirements remain unchanged, but architecture can automatically adapt with changes in data volume and concurrency.

## Using @interaqt/runtime

### Step 1: Installation

```bash
npx create-interaqt-app myInteraqtApp
cd myInteraqtApp
```

### Step 2: execute install script for initializing the database
```bash
npm run install
npm start
```

Your application is now running at http://localhost:4000 by default.

For application definition, refer to https://github.com/InteraqtDev/feique.
