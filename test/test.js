/* eslint-env mocha */
const assert = require("assert");
const fs = require("fs");
const sinon = require("sinon"); // eslint-disable-line
const {parse} = require("acorn");
const {transform} = require("..");

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
      const options = requireFile("options.js") || {};
      const input = readFile("input.js");
      const output = readFile("output.js");

      const result = transform(
        Object.assign({
          name: "exported",
          code: input,
          parse: code => parse(code, {sourceType: "module", ecmaVersion: 2020}),
          sourcemap: true
        }, options)
      );
      assert.equal(result.code, output);
    });
  }
});
