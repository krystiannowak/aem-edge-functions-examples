# Run tests for every example that ships a Makefile (see examples/*/Makefile).
.PHONY: test install-examples
EXAMPLES := $(sort $(dir $(wildcard examples/*/Makefile)))

install-examples:
	@test -n "$(EXAMPLES)" || (echo "No examples found under examples/*/Makefile" && exit 1)
	@set -e; for d in $(EXAMPLES); do \
		echo "==> install $$d"; \
		$(MAKE) -C "$$d" install; \
	done

test:
	@test -n "$(EXAMPLES)" || (echo "No examples found under examples/*/Makefile" && exit 1)
	@set -e; for d in $(EXAMPLES); do \
		echo "==> $$d"; \
		$(MAKE) -C "$$d" test; \
	done
