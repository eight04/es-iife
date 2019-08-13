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
          es5: false,
          name: "exported",
          code: input,
          parse: code => parse(code, {sourceType: "module"}),
          sourcemap: true
        }, options)
      );
      assert.equal(result.code, output);
    });
  }
});

// ES5 Syntax (uses `var`)
describe("es5", () => {
  for (const dir of fs.readdirSync(__dirname + "/es5")) {
    it(dir, () => {
      const readFile = filename => {
        try {
          const content = fs.readFileSync(`${__dirname}/es5/${dir}/${filename}`, "utf8")
            .replace(/\r/g, "");
          return content;
        } catch (err) {
          // pass
        }
      };
      const requireFile = filename => {
        try {
          return require(`${__dirname}/es5/${dir}/${filename}`);
        } catch (err) {
          // pass
        }
      };
      const options = requireFile("options.js") || {};
      const input = readFile("input.js");
      const output = readFile("output.js");

      const result = transform(
        Object.assign({
          es5: true,
          name: "exported",
          code: input,
          parse: code => parse(code, {sourceType: "module"}),
          sourcemap: true
        }, options)
      );
      assert.equal(result.code, output);
    });
  }
});
