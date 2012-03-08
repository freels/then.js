.PHONY: build test

build:
	smoosh make ./build.json

test:
	npm test
