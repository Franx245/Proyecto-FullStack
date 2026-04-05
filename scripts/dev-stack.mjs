import "./dev-next-stack.mjs";

  console.log("[boot] DuelVault stack ready.");
  console.log(`[boot] Store: http://${host}:${storePort}`);
  console.log(`[boot] Admin: http://${host}:${adminPort}`);
  console.log(`[boot] API:   http://${host}:${apiPort}`);
  console.log("[boot] Default admin login: admin@test.com / admin123");
}

main().catch((error) => {
  console.error(`[boot] ${error.message}`);
  shutdown(1);
});
