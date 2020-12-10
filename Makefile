PACKAGES := node_modules/.build
NPATH := node_modules/.bin

default: test

$(PACKAGES): package.json
	npm install
	touch $@

test: $(PACKAGES)
	npm test

lint:
	$(NPATH)/eslint src

.PHONY: test
