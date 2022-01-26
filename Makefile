PACKAGES := node_modules/.build
DOCS := docs/.build
NPATH := node_modules/.bin
SRC := $(shell find src -type f -name '*.js')

default: test

$(PACKAGES): package.json
	npm install
	touch $@

test: $(PACKAGES) $(SRC)
	npm test

test-debug: $(PACKAGES) $(SRC)
	npm run test-debug

docs: $(PACKAGES) $(SRC)
	npm run docs

lint: $(SRC)
	$(NPATH)/eslint --ext .mjs src

.PHONY: test lint docs
