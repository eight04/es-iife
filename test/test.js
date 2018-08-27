/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const sinon = require("sinon"); // eslint-disable-line
const {parse} = require("acorn");
const {transform} = require("..");

const cases = [
  {
    name: "top-level only",
    test: dir => !dir.startsWith("nested") && !dir.startsWith("dynamic"),
    options: {}
  }, {
    name: "nested",
    test: dir => !dir.endsWith("no-nested"),
    options: {nested: true}
  }, {
    name: "work without semi",
    test: dir => !dir.endsWith("no-nested"),
    options: {nested: true},
    removeSemi: true
  }
];

describe("cases", () => {
  for (const dir of fs.readdirSync(__dirname + "/cases")) {
    it(dir, () => {
      const readFile = filename => {
        try {
          const content = fs.readFileSync(`${__dirname}/cases/${dir}/${filename}`, "utf8")
            .replace(/\r/g, "");
          return content;
        } catch (err) {
          // pass
        }
      };
      const requireFile = filename => {
        try {
          return require(`${__dirname}/cases/${dir}/${filename}`);
        } catch (err) {
          // pass
        }
      };
      const tryRemoveSemi = (s) => {
        if (c.removeSemi) {
          s = s.replace(/;/g, "");
        }
        return s;
      };
      const options = requireFile("options.js") || {};
      const input = readFile("input.js");
      const output = readFile("output.js");
      
      return transform(
        Object.assign({
          code: input,
          parse
        }, options)
      )
        .then(result => {
          assert.equal(result.code, output);
          assert.equal(result.isTouched, input !== output);
        });
    });
  }
});
