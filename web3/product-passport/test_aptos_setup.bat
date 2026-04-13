@echo off
setlocal

:: --- Configuration ---
set URL=http://localhost:8080/v1
:: -- faucet-url = http://localhost:8082/v1
:: --- PRIV_KEY is the local profile private key
set PRIV_KEY=0x56bcbf974187b75fe8236ffa09ba0f3ae3ae3df581a9c1f7cb40888af05e5e62
:: --- CONTRACT_ADDR is profile local address
set CONTRACT_ADDR=0x61388ddaec6507d0fefd8867e90087a118da46b4345df5cb8a75ace2d011cf0c

:: --- accounts created on custom network with the URL as the rest api ----
:: --- aptos init --profile <your_profile_name> --network custom --rest-url <your_rest_url> --faucet-url <your_faucet_url>
echo [1/5] Funding profiles...
call aptos account fund-with-faucet --profile Admin
call aptos account fund-with-faucet --profile Issuer
call aptos account fund-with-faucet --profile Test1
call aptos account fund-with-faucet --profile Test2

echo [2/5] Publishing Move modules...
call aptos move publish --named-addresses luxpass=Admin --url %URL% --private-key %PRIV_KEY% --assume-yes

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