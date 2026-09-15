# glossary
Static renderer for the mandatory Glossary section (v1.9 §2.0): one-line definition of every
technical term used anywhere in the notebook, grouped per theme. Prints cleanly.

Data (`LN.data.gl = ...`):
```js
{ title: optional, groups: [{ name: "optional per-group heading",
  terms: [{ t: "term", d: "one-line definition from the source" }] }] }
```
When-not: do not use it as teaching exposition — .def boxes still carry the concept.
