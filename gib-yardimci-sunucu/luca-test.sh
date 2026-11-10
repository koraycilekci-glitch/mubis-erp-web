#!/bin/bash
# Luca TCP erisim testi
timeout 6 bash -c 'echo > /dev/tcp/85.111.5.50/443' 2>/dev/null && echo TCP-443-ACIK || echo TCP-443-KAPALI
timeout 6 bash -c 'echo > /dev/tcp/85.111.5.50/80' 2>/dev/null && echo TCP-80-ACIK || echo TCP-80-KAPALI
curl -s -o /dev/null -m 10 -w 'http80: %{http_code} %{time_total}s\n' http://85.111.5.50/ 2>/dev/null || echo http80-basarisiz
