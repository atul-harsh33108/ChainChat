"""Application package root.

Makes ``src`` a regular package so every module has exactly one fully-qualified
name (``src.<service>.*``) regardless of where mypy is invoked from (BUG-04).
"""