# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models




class ClassifierNode(models.Model):
    parent = models.ForeignKey('self', models.DO_NOTHING, blank=True, null=True)
    name = models.TextField(unique=True)
    unit = models.TextField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'classifier_node'


class EnumDefinition(models.Model):
    classifier_node = models.OneToOneField(ClassifierNode, models.DO_NOTHING)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'enum_definition'


class EnumValue(models.Model):
    enum_definition = models.ForeignKey(EnumDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.FloatField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'enum_value'


class Product(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    sku = models.CharField(unique=True, max_length=100, blank=True, null=True)
    name = models.TextField()
    created_at = models.DateTimeField(blank=True, null=True)
    price = models.IntegerField()
    supplier = models.TextField()
    weight_gram = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'product'


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    enum_value = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_attribute_value'