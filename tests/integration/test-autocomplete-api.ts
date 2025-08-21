import { connectToDatabase } from "../../app/server/utils/database";
import { SupplierPatternModel } from "../../shared/models";

async function testAutocompleteAPI() {
  try {
    await connectToDatabase();

    // Test search for "SACEEM"
    const suppliers = await SupplierPatternModel.find({
      name: { $regex: "SACEEM", $options: "i" },
    })
      .select("supplierId name totalValue totalContracts")
      .sort({ totalValue: -1 })
      .limit(10)
      .lean();

    console.log('Search results for "SACEEM":');
    suppliers.forEach((supplier, index) => {
      console.log(`${index + 1}. ${supplier.name} - ${supplier.totalValue} UYU - ${supplier.totalContracts} contracts`);
    });

    // Test general search
    const generalSearch = await SupplierPatternModel.find({
      name: { $regex: "EMPRESA", $options: "i" },
    })
      .select("supplierId name totalValue totalContracts")
      .sort({ totalValue: -1 })
      .limit(5)
      .lean();

    console.log('\nSearch results for "EMPRESA":');
    generalSearch.forEach((supplier, index) => {
      console.log(`${index + 1}. ${supplier.name} - ${supplier.totalValue} UYU - ${supplier.totalContracts} contracts`);
    });
  } catch (error) {
    console.error("Error testing autocomplete API:", error);
  }
}

testAutocompleteAPI();
