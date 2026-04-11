@echo off
setlocal

:: --- Configuration ---
set URL=http://localhost:8080/v1
:: -- faucet-url = http://localhost:8082/v1
:: --- PRIV_KEY is the local profile private key
set PRIV_KEY=0xd9da2e60da50dbcfc78307fca7401f2de65b9dceac6632e394c8317a09429e52
:: --- CONTRACT_ADDR is profile local address
set CONTRACT_ADDR=0xa23b0e79cd15889d49c0406bf741a80350c1f1bc7097ea96daafe7dc66382f65

:: --- accounts created on custom network with the URL as the rest api ----
:: --- aptos init --profile <your_profile_name> --network custom --rest-url <your_rest_url> --faucet-url <your_faucet_url>
echo [1/5] Funding profiles...
call aptos account fund-with-faucet --profile local
call aptos account fund-with-faucet --profile test1
call aptos account fund-with-faucet --profile test2

echo [2/5] Publishing Move modules...
call aptos move publish --named-addresses luxpass=local --url %URL% --private-key %PRIV_KEY% --assume-yes

echo [3/5] Initializing Issuer Registry...
call aptos move run --function-id %CONTRACT_ADDR%::issuer_registry::init --url %URL% --private-key %PRIV_KEY% --assume-yes

echo [4/5] Initializing Passport Events...
call aptos move run --function-id %CONTRACT_ADDR%::passport::init_events --url %URL% --private-key %PRIV_KEY% --assume-yes

echo [5/5] Adding Admin as Authorized Issuer...
call aptos move run --function-id %CONTRACT_ADDR%::issuer_registry::add_issuer --args address:%CONTRACT_ADDR% --url %URL% --private-key %PRIV_KEY% --assume-yes

echo.
echo ========================================
echo ✅ Setup Complete!
echo ========================================
pause